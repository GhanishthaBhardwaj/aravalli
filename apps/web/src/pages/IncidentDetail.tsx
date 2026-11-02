import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Errors, isIncidentFinal, permit } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { fmtDateTime } from '../app/format';
import { NotFound } from './NotFound';
import { fullName, incidentAgeDays, updatesFor } from '../data/selectors';
import { assignIncident, linkRisk } from '../data/store';
import { AssigneeSelect } from '../components/incident/AssigneeSelect';
import { UpdateComposer } from '../components/incident/UpdateComposer';
import { UpdateTimeline } from '../components/incident/UpdateTimeline';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/fields';
import { Fact, Section } from '../components/ui/layout';
import { SearchableSelect } from '../components/ui/SearchableSelect';

export function IncidentDetail() {
  const { code } = useParams();
  return <Inner key={code} code={code ?? ''} />;
}

function Inner({ code }: { code: string }) {
  const { ds, actor, act, clock } = useData();
  const toast = useToast();
  const inc = ds.incidents.find((i) => i.incident_code === code);
  const [assignee, setAssignee] = useState<number | null>(inc?.assigned_to ?? null);
  const [riskId, setRiskId] = useState<string | null>(inc?.risk_id ? String(inc.risk_id) : null);
  const [errors, setErrors] = useState<Errors>({});
  const riskOpts = useMemo(() => ds.risks.map((r) => ({ value: String(r.risk_id), label: r.title, hint: r.risk_code })), [ds.risks]);

  if (!inc) return <NotFound what="incident" />;
  const dept = ds.departments.find((d) => d.department_id === inc.department_id);
  const reporter = ds.employees.find((e) => e.employee_id === inc.reported_by);
  const assigned = ds.employees.find((e) => e.employee_id === inc.assigned_to);
  const risk = ds.risks.find((r) => r.risk_id === inc.risk_id);
  const pAssign = permit(actor, 'incident.assign', inc);
  const pLink = permit(actor, 'incident.link', inc);
  const closed = isIncidentFinal(inc.status);
  const FINAL = 'Closed incidents are final.';
  const assignReason = pAssign.allowed ? (closed ? FINAL : undefined) : pAssign.reason;
  const linkReason = pLink.allowed ? (closed ? FINAL : undefined) : pLink.reason;
  const days = incidentAgeDays(inc, clock);

  const saveAssign = () => {
    const r = act((d, who, c) => assignIncident(d, inc.incident_id, assignee, who, c));
    if (!r.ok) return setErrors({ assigned_to: r.errors.assigned_to ?? r.errors._form });
    setErrors({});
    toast.push('Assignment saved');
  };
  const saveLink = (next: number | null) => {
    const r = act((d, who, c) => linkRisk(d, inc.incident_id, next, who, c));
    if (!r.ok) return setErrors({ risk_id: r.errors.risk_id ?? r.errors._form });
    setErrors({});
    toast.push(next ? 'Risk linked' : 'Risk unlinked');
  };

  return (
    <Page title={inc.title} code={inc.incident_code}>
      <div className="-mt-6 mb-12 flex flex-wrap items-center gap-x-5 gap-y-2">
        <SeverityBadge severity={inc.severity} />
        <StatusBadge status={inc.status} />
        <span className="text-[14px] text-muted">{['Resolved', 'Closed'].includes(inc.status) ? 'Resolved after' : 'Open for'} <span className="num">{days}</span> {days === 1 ? 'day' : 'days'}</span>
      </div>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-12">
          <Section title="Details">
            <dl className="space-y-5">
              <Fact label="Department">{dept?.name}</Fact>
              <Fact label="Reported by">{fullName(reporter)}</Fact>
              <Fact label="Assigned to">{assigned ? fullName(assigned) : <span className="text-subtle">Unassigned</span>}</Fact>
              <Fact label="Linked risk">{risk ? <Link to={`/risks/${risk.risk_code}`} className="num text-[14px] underline underline-offset-4">{risk.risk_code}</Link> : <span className="text-subtle">None</span>}</Fact>
              <Fact label="Occurred">{fmtDateTime(inc.occurred_at)}</Fact>
              <Fact label="Reported">{fmtDateTime(inc.reported_at)}</Fact>
              <Fact label="Resolved">{fmtDateTime(inc.resolved_at)}</Fact>
              <Fact label="Description"><p className="text-[14px] leading-6 text-muted">{inc.description}</p></Fact>
            </dl>
          </Section>

          <Section title="Assignment">
            <Field label="Assignee" error={errors.assigned_to}>
              {(f) => <AssigneeSelect id={f.id} employees={ds.employees} value={assignee} onChange={setAssignee} invalid={f['aria-invalid']} />}
            </Field>
            <Button onClick={saveAssign} disabledReason={assignReason}>{assigned ? 'Reassign' : 'Assign'}</Button>
          </Section>

          <Section title="Linked risk">
            <Field label="Risk" error={errors.risk_id}>
              {(f) => <SearchableSelect id={f.id} options={riskOpts} value={riskId} onChange={setRiskId} placeholder="No linked risk" disabled={!pLink.allowed || closed} invalid={f['aria-invalid']} />}
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => saveLink(riskId ? Number(riskId) : null)} disabledReason={linkReason}>{risk ? 'Change link' : 'Link risk'}</Button>
              {risk && <Button variant="ghost" onClick={() => { setRiskId(null); saveLink(null); }} disabledReason={linkReason}>Unlink</Button>}
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-12">
          <Section title="Add update"><UpdateComposer incident={inc} /></Section>
          <Section title="Timeline, newest first">
            <UpdateTimeline updates={updatesFor(ds, inc.incident_id)} employees={ds.employees} />
          </Section>
        </div>
      </div>
    </Page>
  );
}
