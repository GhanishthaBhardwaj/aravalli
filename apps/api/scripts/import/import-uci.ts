// Imports the UCI "Incident management process enriched event log" (a real, anonymised ServiceNow log, CC BY 4.0) as the
// organisation "Meridian IT Services".
//
//   npm run import:uci -w @aravalli/api            (database from .env; --db <name> to target another one)
//
// Mapping decisions (also in the README):
//  * The log is an EVENT log: many rows per ticket. We rebuild each ticket as it stood at CUTOFF (a date inside the log), so
//    tickets that were still being worked on at that moment stay Open / Investigating / Contained / Resolved instead of all
//    ending Closed. Tickets opened after the cutoff are left out.
//  * Every date is shifted forward by one fixed number of days so the newest record lands just before "today"; the original
//    timestamp is kept in incident.source_occurred_at.
//  * priority -> severity (1 Critical, 2 High, 3 Moderate -> Medium, 4 Low); assignment group -> department;
//    made_sla and reassignment_count are kept as columns; the ServiceNow number is kept as source_id.
//  * The log has no free text, so titles come from the category codes and the description lists the coded fields.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { one, rows } from '../../src/core/db';
import { arg, bulkInsert, daysBetween, DAY, ensureDemoUsers, ensureOrganisation, ensureRisks, existingSources, hash, incidentCode, INCIDENT_COLUMNS, openPool, parseCsv, rawDir, sqlTime, syncCounter, type RiskSpec } from './common';

export const UCI_CUTOFF = '2017-01-10'; // the state of every ticket is taken as of this midnight (UTC)
export const UCI_NEWEST_BECOMES = '2026-11-02';
export const UCI_SHIFT_DAYS = daysBetween(UCI_CUTOFF, UCI_NEWEST_BECOMES);
const SHIFT = UCI_SHIFT_DAYS * DAY;
const SYSTEM = 'servicenow-uci';

const DEPTS = [
  { code: 'SD', name: 'Service Desk', headTitle: 'Head of Service Desk', staffTitle: 'Service Desk Analyst' },
  { code: 'NET', name: 'Network Operations', headTitle: 'Head of Network Operations', staffTitle: 'Network Engineer' },
  { code: 'APP', name: 'Application Support', headTitle: 'Head of Application Support', staffTitle: 'Application Support Engineer' },
  { code: 'DBA', name: 'Database & Data', headTitle: 'Head of Data Platforms', staffTitle: 'Database Administrator' },
  { code: 'SEC', name: 'Information Security', headTitle: 'Chief Information Security Officer', staffTitle: 'Security Analyst' },
  { code: 'INF', name: 'Infrastructure', headTitle: 'Head of Infrastructure', staffTitle: 'Systems Engineer' },
  { code: 'EUC', name: 'End-User Computing', headTitle: 'Head of End-User Computing', staffTitle: 'Desktop Support Technician' },
  { code: 'VND', name: 'Vendor Management', headTitle: 'Head of Vendor Management', staffTitle: 'Vendor Manager' },
];

const STATUS: Record<string, string> = {
  New: 'Open', Active: 'Investigating', Resolved: 'Resolved', Closed: 'Closed',
  'Awaiting User Info': 'Contained', 'Awaiting Problem': 'Contained', 'Awaiting Vendor': 'Contained', 'Awaiting Evidence': 'Contained',
};
const SEVERITY: Record<string, string> = { '1': 'Critical', '2': 'High', '3': 'Medium', '4': 'Low' };

/** '29/2/2016 01:16' -> milliseconds (UTC), or null for '?' */
function ts(s: string | undefined): number | null {
  if (!s || s === '?') return null;
  const m = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+)$/.exec(s);
  return m ? Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!) : null;
}
const clean = (s: string | undefined, fallback: string): string => (!s || s === '?' ? fallback : s);

const RISKS: RiskSpec[] = [
  { title: 'Critical-priority service outages', category: 'Operational', dept: 'INF', likelihood: 3, impact: 5, earlier: [2, 5], status: 'Mitigating',
    description: 'Tickets raised at priority 1 (Critical) mean a service the business depends on was down or badly degraded. Each one is a customer-visible outage.',
    notes: 'Major-incident process in place; resilience work on the busiest services is the main mitigation.', linkWhere: "i.severity = 'Critical'" },
  { title: 'Tickets stalled awaiting a user, vendor or problem record', category: 'Strategic', dept: 'VND', likelihood: 4, impact: 3, earlier: [3, 3], status: 'Mitigating',
    description: 'Tickets parked in an "awaiting" state stop the clock on the SLA but not on the customer\'s pain. Long waits on vendors are the usual cause.',
    notes: 'Vendor escalation contacts agreed; weekly review of tickets waiting more than five days.', linkWhere: "i.status = 'Contained'" },
  { title: 'Backlog of unresolved incidents', category: 'Operational', dept: 'SD', likelihood: 4, impact: 3, earlier: [3, 3], status: 'Monitoring',
    description: 'Tickets that are still open or being investigated at the reporting date. A growing backlog is the earliest sign that demand is outrunning capacity.',
    notes: 'Backlog size and age reported weekly to the service review.', linkWhere: "i.status IN ('Open', 'Investigating')" },
  { title: 'Tickets bounced between support groups', category: 'Operational', dept: 'SD', likelihood: 4, impact: 3, earlier: [4, 2], status: 'Mitigating',
    description: 'A ticket reassigned three or more times usually means it was routed to the wrong team first. Each hand-off adds delay and loses context.',
    notes: 'Routing rules under review; Service Desk is adding a triage checklist.', linkWhere: 'i.reassignment_count >= 3' },
  { title: 'Missed service-level targets', category: 'Compliance', dept: 'SD', likelihood: 4, impact: 4, earlier: [3, 4], status: 'Mitigating',
    description: 'Incidents where the ServiceNow made_sla flag is false: the agreed resolution time was missed. Repeated misses breach customer contracts.',
    notes: 'SLA dashboard reviewed daily; priority queue for tickets nearing breach.', linkWhere: 'i.made_sla = 0' },
  { title: 'Tickets with no assigned resolver', category: 'Operational', dept: 'SD', likelihood: 3, impact: 3, earlier: [3, 2], status: 'Assessed',
    description: 'Tickets that carry no assignee in the source record have nobody accountable for them.',
    notes: 'Unassigned queue is checked at the start of every shift.', linkWhere: 'i.assigned_to IS NULL' },
  { title: 'Recurring failures in the busiest incident category', category: 'Technology', dept: 'APP', likelihood: 4, impact: 3, earlier: [4, 3], status: 'Monitoring',
    description: 'Category 42 is the single biggest source of tickets in the log. Volume at this level points to a recurring cause that a problem record should remove.',
    notes: 'Problem record opened; root-cause review scheduled.', linkWhere: "i.title LIKE 'Category 42%'" },
  { title: 'Recurring failures in the second-busiest incident category', category: 'Technology', dept: 'NET', likelihood: 3, impact: 3, earlier: [3, 3], status: 'Monitoring',
    description: 'Category 26 is the second biggest source of tickets in the log.',
    notes: 'Trend reviewed monthly.', linkWhere: "i.title LIKE 'Category 26%'" },
];

const pad = (n: number) => String(n).padStart(2, '0');

async function main() {
  const pool = openPool();
  const file = join(rawDir, 'uci-incident-log', 'incident_event_log.csv');
  const started = Date.now();
  const all = parseCsv(readFileSync(file, 'utf8'));
  const header = all.shift()!;
  const c = Object.fromEntries(header.map((n, i) => [n, i])) as Record<string, number>;
  const cutoff = Date.parse(`${UCI_CUTOFF}T00:00:00Z`);

  const byTicket = new Map<string, string[][]>();
  for (const r of all) {
    if (r.length !== header.length) continue;
    (byTicket.get(r[0]!) ?? byTicket.set(r[0]!, []).get(r[0]!)!).push(r);
  }

  const setup = await ensureOrganisation(pool, {
    name: 'Meridian IT Services', slug: 'meridian-it-services', domain: 'meridian-it.example', createdAt: '2026-01-05 09:00:00',
    dataNote: `Incidents are real, anonymised ServiceNow tickets from the UCI "Incident management process enriched event log" (CC BY 4.0). Dates are shifted forward by ${UCI_SHIFT_DAYS} days so the newest ticket is near today; the original timestamp is kept on each incident. Staff and department names are invented: the source is anonymised.`,
    departments: DEPTS, staffPerDept: 6,
    central: [['Org Admin', 'SD', 'IT Operations Director'], ['Risk Officer', 'SEC', 'IT Risk Manager'], ['Risk Officer', 'SD', 'Service Risk Analyst'], ['Auditor', 'SEC', 'Internal IT Auditor']],
  });

  const { ids: have, maxCode } = await existingSources(pool, setup.organisationId, SYSTEM);
  const deptCodes = DEPTS.map((d) => d.code);
  const deptFor = (group: string): string => {
    const m = /(\d+)/.exec(group);
    if (!m) return 'SD';
    const g = Number(m[1]);
    return g === 70 ? 'SD' : deptCodes[(g % 7) + 1]!;
  };

  interface Built { row: unknown[]; transitions: Array<{ at: number; from: string | null; to: string; text: string }>; reportedBy: number; assignee: number | null }
  const built = new Map<string, Built>();
  const order: Array<{ number: string; opened: number }> = [];

  for (const [number, events] of byTicket) {
    if (have.has(number)) continue;
    const first = events[0]!;
    const opened = ts(first[c.opened_at!]);
    if (opened === null || opened >= cutoff) continue;
    const sorted = [...events].sort((a, b) => Number(a[c.sys_mod_count!]) - Number(b[c.sys_mod_count!]));
    let upto = sorted.filter((e) => (ts(e[c.sys_updated_at!]) ?? 0) < cutoff && STATUS[e[c.incident_state!]!]);
    if (!upto.length) upto = [sorted.find((e) => STATUS[e[c.incident_state!]!]) ?? sorted[0]!];
    const f = upto[upto.length - 1]!; // the ticket as it stood at the cutoff

    const created = ts(first[c.sys_created_at!]) ?? opened;
    const reported = Math.max(opened, created);
    const dept = deptFor(f[c.assignment_group!]!);
    const staff = setup.staff.get(dept)!;
    const sd = setup.staff.get('SD')!;
    const reportedBy = sd[hash(first[c.opened_by!]!) % sd.length]!.employee_id;
    const resolver = f[c.assigned_to!]!;
    const assignee = resolver === '?' ? null : staff[hash(resolver) % staff.length]!.employee_id;

    const transitions: Built['transitions'] = [];
    let prev: string | null = null;
    for (const e of upto) {
      const to = STATUS[e[c.incident_state!]!]!;
      if (to === prev) continue;
      const at = Math.max(ts(e[c.sys_updated_at!]) ?? reported, reported);
      transitions.push({ at, from: prev, to, text: prev === null ? `Ticket opened (source state "${e[c.incident_state!]}").` : `Source state changed to "${e[c.incident_state!]}".` });
      prev = to;
    }
    const status = prev!;
    let resolvedAt: number | null = null;
    if (status === 'Resolved' || status === 'Closed') {
      let k = transitions.length - 1;
      while (k > 0 && (transitions[k - 1]!.to === 'Resolved' || transitions[k - 1]!.to === 'Closed')) k--;
      resolvedAt = Math.max(transitions[k]!.at, opened);
    }

    const prio = /^(\d)/.exec(f[c.priority!]!)?.[1] ?? '3';
    const cat = clean(first[c.category!], 'Uncategorised');
    const sub = clean(first[c.subcategory!], 'no subcategory');
    const sym = clean(first[c.u_symptom!], 'no symptom recorded');
    const description = [
      `Imported from the UCI ServiceNow incident log, ticket ${number}.`,
      `Raised via ${clean(first[c.contact_type!], 'unknown channel')}${first[c.location!] === '?' ? '' : ` from ${first[c.location!]}`}.`,
      `${cat} / ${sub}; symptom: ${sym}; configuration item: ${clean(first[c.cmdb_ci!], 'none recorded')}.`,
      `Priority ${f[c.priority!]} (impact ${f[c.impact!]}, urgency ${f[c.urgency!]}). Assignment group: ${clean(f[c.assignment_group!], 'none')}.`,
      f[c.closed_code!] !== '?' && (status === 'Resolved' || status === 'Closed') ? `Resolution code: ${f[c.closed_code!]}.` : '',
    ].filter(Boolean).join('\n');

    order.push({ number, opened });
    built.set(number, {
      reportedBy, assignee, transitions,
      row: [setup.organisationId, null, `${cat} / ${sub}`.slice(0, 150), description, SEVERITY[prio] ?? 'Medium', status, setup.departments.get(dept), reportedBy, assignee,
        sqlTime(opened + SHIFT), sqlTime(reported + SHIFT), resolvedAt === null ? null : sqlTime(resolvedAt + SHIFT), SYSTEM, number,
        first[c.opened_at!]!.length > 0 ? originalStamp(opened) : null, f[c.made_sla!] === 'true' ? 1 : 0, Number(f[c.reassignment_count!]) || 0, null, null],
    });
  }

  order.sort((a, b) => a.opened - b.opened || a.number.localeCompare(b.number));
  const only = Number(arg('limit') ?? 0); // --limit N: just the newest N tickets (the test database uses a small slice)
  if (only > 0 && order.length > only) order.splice(0, order.length - only);
  const incidentRows = order.map((o, i) => { const b = built.get(o.number)!; b.row[1] = incidentCode(maxCode + i + 1); return b.row; });
  const inserted = await bulkInsert(pool, 'incident', INCIDENT_COLUMNS, incidentRows);

  // the append-only log: one entry per change of state, for the incidents inserted in this run
  const idRows = await rows<{ incident_id: number; source_id: string }>(pool, 'SELECT incident_id, source_id FROM incident WHERE organisation_id = ? AND source_system = ?', [setup.organisationId, SYSTEM]);
  const idOf = new Map(idRows.map((r) => [r.source_id, r.incident_id]));
  const updates: unknown[][] = [];
  for (const o of order) {
    const b = built.get(o.number)!;
    const id = idOf.get(o.number);
    if (!id) continue;
    for (const t of b.transitions) updates.push([setup.organisationId, id, b.assignee ?? b.reportedBy, t.text, t.from, t.to, sqlTime(t.at + SHIFT)]);
  }
  const logged = await bulkInsert(pool, 'incident_update', ['organisation_id', 'incident_id', 'updated_by', 'update_text', 'status_from', 'status_to', 'created_at'], updates, 2000);

  await syncCounter(pool, setup.organisationId, 'incident', 'incident', 'incident_code', 'INC-');
  const risks = await ensureRisks(pool, setup, RISKS, UCI_NEWEST_BECOMES);
  const demoUsers = await ensureDemoUsers(pool, setup, 'SD', '2026-01-05 09:00:00');
  const total = await one<{ n: number }>(pool, 'SELECT COUNT(*) AS n FROM incident WHERE organisation_id = ?', [setup.organisationId]);
  const byStatus = await rows<{ status: string; n: number }>(pool, 'SELECT status, COUNT(*) AS n FROM incident WHERE organisation_id = ? GROUP BY status ORDER BY n DESC', [setup.organisationId]);
  console.log(`Meridian IT Services (organisation ${setup.organisationId}): ${inserted} incidents inserted this run, ${total!.n} in total; ${logged} log entries; ${risks.risks} risks created, ${risks.linked} incidents newly linked; ${demoUsers} demo accounts created.`);
  console.log(`Cutoff ${UCI_CUTOFF}; dates shifted by +${UCI_SHIFT_DAYS} days. Status at cutoff: ${byStatus.map((s) => `${s.status} ${s.n}`).join(', ')}. (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  await pool.end();
}

function originalStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

main().catch((e) => { console.error(e); process.exit(1); });
