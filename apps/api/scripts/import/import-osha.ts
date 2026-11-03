// Imports OSHA Severe Injury Reports (US federal OSHA, public) as the organisation "Ironbridge Manufacturing Group", a large
// manufacturing group with many plants. Its incidents are real OSHA records from many different US manufacturers: no single
// company had them all, and no employer is named here.
//
//   npm run import:osha -w @aravalli/api                    manufacturing, 2024 onwards (about 5,500 rows)
//   npm run import:osha -w @aravalli/api -- --all-manufacturing --db aravalli_perf     every manufacturing record since 2015
//                                                                                       (34,472 rows), for performance testing only
//
// Mapping decisions (also in the README):
//  * Only manufacturing: Primary NAICS starting 31, 32 or 33.
//  * Dropped for privacy: Employer, Address1, Address2, City, Zip, Latitude, Longitude. Kept: date, NAICS, State, ID (source_id).
//  * Final Narrative -> description. Title from Nature, Part of Body and Event.
//  * Severity: Amputation or Loss of Eye -> Critical; Hospitalized -> High; otherwise Medium.
//  * Department from the Event and Source text (see departmentFor).
//  * Dates are shifted forward by one fixed number of days so the newest record lands just before "today"; the original date
//    is kept in incident.source_occurred_at. Recent records stay open, older ones are closed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { one, rows } from '../../src/core/db';
import { arg, bulkInsert, daysBetween, DAY, ensureDemoUsers, ensureOrganisation, ensureRisks, existingSources, flag, hash, incidentCode, INCIDENT_COLUMNS, openPool, parseCsv, rawDir, sqlTime, syncCounter, type RiskSpec } from './common';

export const OSHA_DATA_ENDS = '2025-11-30'; // the file covers 1/1/2015 to 11/30/2025
export const OSHA_END_BECOMES = '2026-11-02';
export const OSHA_SHIFT_DAYS = daysBetween(OSHA_DATA_ENDS, OSHA_END_BECOMES);
const SHIFT = OSHA_SHIFT_DAYS * DAY;
const SYSTEM = 'osha-severe-injury';
const OPEN_FROM = Date.UTC(2025, 9, 1); // records on or after 1 Oct 2025 are still being worked
const RESOLVED_FROM = Date.UTC(2025, 7, 1); // 1 Aug to 30 Sep 2025: a mix of Resolved and Closed

const DEPTS = [
  { code: 'PRD', name: 'Production', headTitle: 'Head of Production', staffTitle: 'Production Operator' },
  { code: 'MNT', name: 'Maintenance', headTitle: 'Head of Maintenance', staffTitle: 'Maintenance Technician' },
  { code: 'WHS', name: 'Warehouse', headTitle: 'Head of Warehousing', staffTitle: 'Warehouse Associate' },
  { code: 'LOG', name: 'Logistics', headTitle: 'Head of Logistics', staffTitle: 'Logistics Coordinator' },
  { code: 'QLT', name: 'Quality', headTitle: 'Head of Quality', staffTitle: 'Quality Inspector' },
  { code: 'EHS', name: 'Corporate EHS', headTitle: 'Director of Environment, Health & Safety', staffTitle: 'EHS Specialist' },
];

const tidy = (s: string): string => s.trim().replace(/\s{2,}/g, ' - ');

/** Plant department from what the record says happened and what was involved. First match wins. */
export function departmentFor(event: string, source: string, nature: string): string {
  const e = event.toLowerCase();
  const s = source.toLowerCase();
  const n = nature.toLowerCase();
  if (e.includes('during maintenance') || e.includes('repair') || s.includes('maintenance')) return 'MNT';
  if (/forklift|pallet|hand truck|dolly|order picker|stacker|rack|shelv/.test(s)) return 'WHS';
  if (/truck|trailer|vehicle|highway|dock|rail|loading|crane|hoist/.test(s) || /vehicle|transportation|highway/.test(e)) return 'LOG';
  if (/chemical|exposure|inhal|toxic|laborator|inspect|gauging|test/.test(e + ' ' + s + ' ' + n)) return 'QLT';
  return 'PRD';
}

export function severityFor(hospitalized: number, amputation: number, lossOfEye: number): 'Critical' | 'High' | 'Medium' {
  if (amputation > 0 || lossOfEye > 0) return 'Critical';
  return hospitalized > 0 ? 'High' : 'Medium';
}

const RISKS: RiskSpec[] = [
  { title: 'Hazardous energy during maintenance and cleaning', category: 'Compliance', dept: 'MNT', likelihood: 4, impact: 5, earlier: [4, 4], status: 'Mitigating',
    description: 'Workers hurt while servicing, cleaning or testing equipment that starts or moves unexpectedly. The largest single cause of severe injuries in the records. Controlled by lockout/tagout.',
    notes: 'Lockout/tagout audit across all plants; machine-specific procedures being written for the ten highest-incident plants.', linkWhere: "i.title LIKE '%during maintenance%'" },
  { title: 'Forklift and powered industrial truck incidents', category: 'Operational', dept: 'WHS', likelihood: 4, impact: 4, earlier: [4, 3], status: 'Mitigating',
    description: 'Pedestrians struck, trucks tipping over, operators crushed. Warehouse and dock traffic is the highest-frequency hazard outside production.',
    notes: 'Pedestrian exclusion zones, speed limiters and refresher licences for every operator.', linkWhere: "i.description LIKE '%Source: %forklift%'" },
  { title: 'Unguarded machinery in normal operation', category: 'Operational', dept: 'PRD', likelihood: 4, impact: 5, earlier: [4, 5], status: 'Mitigating',
    description: 'Hands and arms caught in presses, conveyors, saws and rollers while the machine is running. These injuries are most often amputations.',
    notes: 'Guarding survey complete; interlocks retrofitted on presses first.', linkWhere: "i.title LIKE '%Caught%' OR i.title LIKE '%running powered equipment%'" },
  { title: 'Struck by falling or moving objects', category: 'Operational', dept: 'WHS', likelihood: 3, impact: 4, earlier: [3, 4], status: 'Monitoring',
    description: 'Loads falling from racks, tools dropped from height, material shifting on a conveyor.',
    notes: 'Rack inspections quarterly; hard hats mandatory in storage aisles.', linkWhere: "i.title LIKE '%falling object%' OR i.title LIKE '%Struck by%'" },
  { title: 'Burns from hot surfaces, substances and flame', category: 'Operational', dept: 'PRD', likelihood: 3, impact: 4, earlier: [3, 3], status: 'Monitoring',
    description: 'Contact with hot metal, molten material, steam and heated process fluids.',
    notes: 'Heat-resistant PPE standard issue; hot-work permits tightened.', linkWhere: "i.title LIKE '%hot objects%' OR i.title LIKE '%Burn%'" },
  { title: 'Slips, trips and falls at plant level', category: 'Operational', dept: 'PRD', likelihood: 5, impact: 3, earlier: [5, 3], status: 'Mitigating',
    description: 'Falls on the same level from wet floors, cables and clutter. Frequent, usually less severe, and very preventable.',
    notes: 'Housekeeping standard and floor-marking programme.', linkWhere: "i.title LIKE '%Fall on same level%'" },
  { title: 'Falls from height and to a lower level', category: 'Operational', dept: 'MNT', likelihood: 3, impact: 5, earlier: [3, 5], status: 'Mitigating',
    description: 'Falls from ladders, platforms, roofs and equipment. Fewer than slips but far more severe.',
    notes: 'Fall-protection plan per site; ladder replacement programme.', linkWhere: "i.title LIKE '%fall to lower level%' OR i.title LIKE '%Fall to lower level%'" },
  { title: 'Exposure to hazardous substances', category: 'Compliance', dept: 'QLT', likelihood: 2, impact: 4, earlier: [2, 4], status: 'Monitoring',
    description: 'Chemical burns, inhalation and contact exposures in production and in the quality laboratory.',
    notes: 'Safety data sheets and ventilation checks reviewed annually.', linkWhere: "i.title LIKE '%xposure%' OR i.title LIKE '%hemical%'" },
  { title: 'Vehicle, dock and transport incidents', category: 'Operational', dept: 'LOG', likelihood: 2, impact: 4, earlier: [2, 4], status: 'Monitoring',
    description: 'Injuries at loading docks and in yard vehicle movements.',
    notes: 'Dock-lock and wheel-chock rules; yard speed limit.', linkWhere: "i.title LIKE '%ehicle%' OR i.title LIKE '%ransportation%'" },
];

const original = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

async function main() {
  const pool = openPool();
  const started = Date.now();
  const everything = flag('all-manufacturing');
  const all = parseCsv(readFileSync(join(rawDir, 'osha-severe-injury.csv'), 'utf8'));
  const header = all.shift()!;
  const c = Object.fromEntries(header.map((n, i) => [n, i])) as Record<string, number>;
  const col = (r: string[], n: string): string => r[c[n]!] ?? '';

  const setup = await ensureOrganisation(pool, {
    name: 'Ironbridge Manufacturing Group', slug: 'ironbridge-manufacturing', domain: 'ironbridge.example', createdAt: '2026-01-05 09:00:00',
    dataNote: `Ironbridge is an invented manufacturing group. Its incidents are real OSHA Severe Injury Reports from many different US manufacturers (federal OSHA public data, 2024 to Nov 2025); no employer is named. Dates are shifted forward by ${OSHA_SHIFT_DAYS} days so the newest record is near today; the original date is kept on each incident. Staff names are invented.`,
    departments: DEPTS, staffPerDept: 8,
    central: [['Org Admin', 'EHS', 'VP, Operations Excellence'], ['Risk Officer', 'EHS', 'Group Risk Manager'], ['Risk Officer', 'EHS', 'Plant Safety Risk Analyst'], ['Auditor', 'EHS', 'Internal Safety Auditor']],
  });
  const { ids: have, maxCode } = await existingSources(pool, setup.organisationId, SYSTEM);

  interface Item { id: string; at: number; row: unknown[]; log: Array<[number, string | null, string, string]>; actor: number }
  const items: Item[] = [];
  for (const r of all) {
    if (r.length !== header.length) continue;
    if (!/^(31|32|33)/.test(col(r, 'Primary NAICS'))) continue;
    const [mo, da, yr] = col(r, 'EventDate').split('/').map(Number) as [number, number, number];
    if (!everything && yr < 2024) continue;
    const id = col(r, 'ID');
    if (have.has(id)) continue;

    const day = Date.UTC(yr, mo - 1, da);
    const h = hash(id);
    const occurred = day + (6 + (h % 12)) * 3_600_000 + (h % 4) * 900_000;
    const reported = occurred + (1 + (h >>> 4) % 30) * 3_600_000;
    const event = tidy(col(r, 'EventTitle'));
    const source = tidy(col(r, 'SourceTitle'));
    const nature = tidy(col(r, 'NatureTitle'));
    const body = tidy(col(r, 'Part of Body Title'));
    const dept = departmentFor(event, source, nature);
    const staff = setup.staff.get(dept)!;
    const sev = severityFor(Number(col(r, 'Hospitalized')), Number(col(r, 'Amputation')), Number(col(r, 'Loss of Eye')));
    const reportedBy = staff[h % staff.length]!.employee_id;
    const assignee = sev === 'Critical' || sev === 'High' ? setup.head.get(dept)!.employee_id : staff[(h >>> 8) % staff.length]!.employee_id;

    let status: string;
    let resolved: number | null = null;
    const log: Item['log'] = [[reported, null, 'Open', 'Reported to OSHA as a severe injury.']];
    if (day >= OPEN_FROM) {
      status = (['Open', 'Investigating', 'Contained'] as const)[h % 3]!;
      if (status !== 'Open') log.push([reported + 6 * 3_600_000, 'Open', 'Investigating', 'Investigation started.']);
      if (status === 'Contained') log.push([reported + 30 * 3_600_000, 'Investigating', 'Contained', 'Hazard contained pending corrective action.']);
    } else {
      status = day >= RESOLVED_FROM && h % 4 === 0 ? 'Resolved' : 'Closed';
      resolved = reported + (3 + (h >>> 6) % 25) * DAY;
      log.push([reported + 6 * 3_600_000, 'Open', 'Investigating', 'Investigation started.']);
      log.push([resolved, 'Investigating', 'Resolved', 'Corrective action completed and verified.']);
      if (status === 'Closed') log.push([resolved + (1 + (h >>> 10) % 6) * DAY, 'Resolved', 'Closed', 'Reviewed and closed.']);
    }

    const narrative = col(r, 'Final Narrative').trim();
    const description = `${narrative}\n\nEvent: ${event}.\nSource: ${source}.\nInjury: ${nature}${body ? `, ${body}` : ''}.\nPlant location: ${col(r, 'State')}, NAICS ${col(r, 'Primary NAICS')}. OSHA severe injury report ${id}.`;
    items.push({
      id, at: occurred, actor: assignee, log,
      row: [setup.organisationId, null, `${nature} (${body || 'body part not stated'}) - ${event}`.slice(0, 150), description, sev, status, setup.departments.get(dept), reportedBy, assignee,
        sqlTime(occurred + SHIFT), sqlTime(reported + SHIFT), resolved === null ? null : sqlTime(resolved + SHIFT), SYSTEM, id, `${original(day)}`, null, null, col(r, 'State').slice(0, 30), col(r, 'Primary NAICS').slice(0, 6)],
    });
  }

  items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const only = Number(arg('limit') ?? 0); // --limit N: just the newest N records (the test database uses a small slice)
  if (only > 0 && items.length > only) items.splice(0, items.length - only);
  items.forEach((it, i) => { it.row[1] = incidentCode(maxCode + i + 1); });
  const inserted = await bulkInsert(pool, 'incident', INCIDENT_COLUMNS, items.map((i) => i.row));

  const idRows = await rows<{ incident_id: number; source_id: string }>(pool, 'SELECT incident_id, source_id FROM incident WHERE organisation_id = ? AND source_system = ?', [setup.organisationId, SYSTEM]);
  const idOf = new Map(idRows.map((r) => [r.source_id, r.incident_id]));
  const updates: unknown[][] = [];
  for (const it of items) {
    const incidentId = idOf.get(it.id);
    if (!incidentId) continue;
    for (const [at, from, to, text] of it.log) updates.push([setup.organisationId, incidentId, it.actor, text, from, to, sqlTime(at + SHIFT)]);
  }
  const logged = await bulkInsert(pool, 'incident_update', ['organisation_id', 'incident_id', 'updated_by', 'update_text', 'status_from', 'status_to', 'created_at'], updates, 2000);

  await syncCounter(pool, setup.organisationId, 'incident', 'incident', 'incident_code', 'INC-');
  const risks = await ensureRisks(pool, setup, RISKS, OSHA_END_BECOMES);
  const demoUsers = await ensureDemoUsers(pool, setup, 'PRD', '2026-01-05 09:00:00');
  const total = await one<{ n: number }>(pool, 'SELECT COUNT(*) AS n FROM incident WHERE organisation_id = ?', [setup.organisationId]);
  const byStatus = await rows<{ status: string; n: number }>(pool, 'SELECT status, COUNT(*) AS n FROM incident WHERE organisation_id = ? GROUP BY status ORDER BY n DESC', [setup.organisationId]);
  console.log(`Ironbridge Manufacturing Group (organisation ${setup.organisationId}): ${inserted} incidents inserted this run, ${total!.n} in total; ${logged} log entries; ${risks.risks} risks created, ${risks.linked} incidents newly linked; ${demoUsers} demo accounts created.`);
  console.log(`Scope: ${everything ? 'all manufacturing 2015-2025 (performance test)' : 'manufacturing 2024-2025'}; dates shifted by +${OSHA_SHIFT_DAYS} days. Status: ${byStatus.map((s) => `${s.status} ${s.n}`).join(', ')}. (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
