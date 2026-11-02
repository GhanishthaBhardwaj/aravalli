import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { NotFound } from './NotFound';
import { fullName, incidentAgeDays, updatesFor } from '../data/selectors';
import { assignIncident, linkRisk } from '../data/store';
import { type Errors, permit } from '@aravalli/shared';
import { Button } from '../components/ui/Button';
import { SeverityChip, StatusChip } from '../components/ui/Chip';
import { Field } from '../components/ui/fields';
import { Fact, Panel, SearchableSelect } from '../components/ui/misc';
import { AssigneeSelect } from '../components/incident/AssigneeSelect';
import { UpdateComposer } from '../components/incident/UpdateComposer';
import { UpdateTimeline } from '../components/incident/UpdateTimeline';
import { fmtDateTime } from '../app/format';

export function IncidentDetail() {
  const { code } = useParams();
  return <Inner key={code} code={code ?? ''} />;
}

function Inner({ code }: { code: string }) {
  const { ds, actor, act } = useData();
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
  const closed = inc.status === 'Closed';

  const saveAssign = () => {
    const r = act((d, who) => assignIncident(d, inc.incident_id, assignee, who));
    if (!r.ok) return setErrors({ assigned_to: r.errors.assigned_to ?? r.errors._form });
    setErrors({});
    toast.push('Assignment saved (demo)');
  };
  const saveLink = (next: number | null) => {
    const r = act((d, who) => linkRisk(d, inc.incident_id, next, who));
    if (!r.ok) return setErrors({ risk_id: r.errors.risk_id ?? r.errors._form });
    setErrors({});
    toast.push(next ? 'Risk linked (demo)' : 'Risk unlinked (demo)');
  };

  return (
    <Page title={`${inc.incident_code} · ${inc.title}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="mono text-sm font-medium">{inc.incident_code}</span>
        <SeverityChip severity={inc.severity} />
        <StatusChip status={inc.status} />
        <span className="text-[14px] text-muted">{['Resolved', 'Closed'].includes(inc.status) ? 'Resolved after' : 'Open for'} {incidentAgeDays(inc)} {incidentAgeDays(inc) === 1 ? 'day' : 'days'}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Panel title="Facts">
            <dl className="space-y-3">
              <Fact label="Department">{dept?.name}</Fact>
              <Fact label="Reported by">{fullName(reporter)}</Fact>
              <Fact label="Assigned to">{assigned ? fullName(assigned) : <span className="text-muted">Unassigned</span>}</Fact>
              <Fact label="Linked risk">{risk ? <Link to={`/risks/${risk.risk_code}`} className="mono text-[12px] underline">{risk.risk_code}</Link> : <span className="text-muted">None</span>}</Fact>
              <Fact label="Occurred">{fmtDateTime(inc.occurred_at)}</Fact>
              <Fact label="Reported">{fmtDateTime(inc.reported_at)}</Fact>
              <Fact label="Resolved">{fmtDateTime(inc.resolved_at)}</Fact>
              <Fact label="Description"><p className="text-[13px]">{inc.description}</p></Fact>
            </dl>
          </Panel>

          <Panel title="Assignment">
            <Field label="Assignee" error={errors.assigned_to}>
              {(f) => <AssigneeSelect id={f.id} employees={ds.employees} value={assignee} onChange={setAssignee} invalid={f['aria-invalid']} />}
            </Field>
            <Button onClick={saveAssign} disabledReason={pAssign.allowed ? (closed ? 'Closed incidents cannot be reassigned.' : undefined) : pAssign.reason}>
              {assigned ? 'Reassign' : 'Assign'}
            </Button>
          </Panel>

          <Panel title="Linked risk">
            <Field label="Risk" error={errors.risk_id}>
              {(f) => <SearchableSelect id={f.id} options={riskOpts} value={riskId} onChange={setRiskId} placeholder="No linked risk" disabled={!pLink.allowed} invalid={f['aria-invalid']} />}
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => saveLink(riskId ? Number(riskId) : null)} disabledReason={pLink.allowed ? undefined : pLink.reason}>
                {risk ? 'Change link' : 'Link risk'}
              </Button>
              {risk && (
                <Button
                  onClick={() => { setRiskId(null); saveLink(null); }}
                  disabledReason={pLink.allowed ? undefined : pLink.reason}
                >
                  Unlink
                </Button>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Add update">
            <UpdateComposer incident={inc} />
          </Panel>
          <Panel title="Update timeline (newest first)">
            <UpdateTimeline updates={updatesFor(ds, inc.incident_id)} employees={ds.employees} />
          </Panel>
        </div>
      </div>
    </Page>
  );
}
