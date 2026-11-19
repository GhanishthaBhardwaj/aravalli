import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Errors, INCIDENT_STATUSES, isIncidentFinal, permit } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { fmtDateTime } from '../app/format';
import { NotFound } from './NotFound';
import { api, fieldErrors } from '../api/client';
import { isNotFound, useApi } from '../api/useApi';
import { incidentAgeDays } from '../lib/derive';
import { UpdateComposer } from '../components/incident/UpdateComposer';
import { UpdateTimeline } from '../components/incident/UpdateTimeline';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/fields';
import { Card } from '../components/ui/layout';
import { PersonPicker } from '../components/ui/PersonPicker';
import { RiskPicker } from '../components/ui/RiskPicker';

export function IncidentDetail() {
  const { code } = useParams();
  return <Inner key={code} code={code ?? ''} />;
}

function Inner({ code }: { code: string }) {
  const { actor, clock } = useSession();
  const toast = useToast();
  const { data: inc, loading, error, reload, setData } = useApi((signal) => api.incident(code, signal), [code]);
  const [assignee, setAssignee] = useState<number | null | undefined>(undefined); // undefined: untouched, follow the record
  const [riskId, setRiskId] = useState<string | null | undefined>(undefined);
  const [errors, setErrors] = useState<Errors>({});

  if (isNotFound(error)) return <NotFound what="incident" />;

  const assigneeValue = assignee === undefined ? inc?.assigned_to ?? null : assignee;
  const riskValue = riskId === undefined ? (inc?.risk_id ? String(inc.risk_id) : null) : riskId;
  const pAssign = permit(actor, 'incident.assign', inc as never);
  const pLink = permit(actor, 'incident.link', inc as never);
  const closed = inc ? isIncidentFinal(inc.status) : false;
  const FINAL = 'Closed incidents are final.';
  const assignReason = pAssign.allowed ? (closed ? FINAL : undefined) : pAssign.reason;
  const linkReason = pLink.allowed ? (closed ? FINAL : undefined) : pLink.reason;
  const days = inc ? incidentAgeDays(inc, clock.now()) : 0;

  const saveAssign = async () => {
    if (!inc) return;
    try {
      setData(await api.assignIncident(inc.incident_id, assigneeValue));
      setAssignee(undefined);
      setErrors({});
      toast.push('Assignment saved');
    } catch (err) {
      const e = fieldErrors(err);
      setErrors({ assigned_to: e.employee_id ?? e.assigned_to ?? e._form });
    }
  };
  const saveLink = async (next: number | null) => {
    if (!inc) return;
    try {
      setData(await api.linkIncidentRisk(inc.incident_id, next));
      setRiskId(undefined);
      setErrors({});
      toast.push(next ? 'Risk linked' : 'Risk unlinked');
    } catch (err) {
      const e = fieldErrors(err);
      setErrors({ risk_id: e.risk_id ?? e._form });
    }
  };

  // The stage bar: each stage reached shows when it was first reached; a reopened incident simply moves back.
  const reached = (stage: string) => inc?.updates.filter((u) => u.status_to === stage).map((u) => u.created_at).sort()[0];
  const stageIndex = inc ? INCIDENT_STATUSES.indexOf(inc.status) : 0;

  return (
    <Page title={inc?.title ?? code} compact loading={loading} error={error} onRetry={reload}>
      {inc && (
        <div className="flex flex-col gap-[18px]">
          <div className="-mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <SeverityBadge severity={inc.severity} />
            <StatusBadge status={inc.status} />
            <span className="text-[12.5px] text-muted"><span className="code">{inc.incident_code}</span> · reported {fmtDateTime(inc.reported_at)}</span>
            <span className="text-[13.5px] text-muted">· {['Resolved', 'Closed'].includes(inc.status) ? 'Resolved after' : 'Open for'} <span className="num">{days}</span> {days === 1 ? 'day' : 'days'}</span>
          </div>

          <ol aria-label="Incident progress" className="grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-5">
            {INCIDENT_STATUSES.map((stage, i) => {
              const done = i <= stageIndex;
              const when = reached(stage);
              return (
                <li key={stage} aria-current={i === stageIndex ? 'step' : undefined} className="border-t-[3px] pt-2" style={{ borderColor: i === stageIndex ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--line)' }}>
                  <div className={done ? (i === stageIndex ? 'font-bold' : 'font-medium') : 'font-medium text-muted'}>{stage}</div>
                  <div className="num text-[12px] text-muted">{when ? fmtDateTime(when) : 'Not yet'}</div>
                </li>
              );
            })}
          </ol>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card className="p-5">
                <h2 className="mb-2.5 text-[15px] font-semibold">What happened</h2>
                <p className="max-w-[68ch] whitespace-pre-line break-words text-[14.5px] leading-6">{inc.description}</p>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3.5 text-[15px] font-semibold">Details</h2>
                <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <Detail label="Department">{inc.department_name}</Detail>
                  <Detail label="Reported by">{inc.reported_by_name}</Detail>
                  <Detail label="Assigned to">{inc.assigned_to_name ?? <span className="text-muted">Unassigned</span>}</Detail>
                  <Detail label="Occurred"><span className="num">{fmtDateTime(inc.occurred_at)}</span></Detail>
                  <Detail label="Resolved"><span className="num">{fmtDateTime(inc.resolved_at)}</span></Detail>
                  <Detail label="Linked risk">{inc.risk_code ? <Link to={`/risks/${inc.risk_code}`} className="code font-medium text-accent underline-offset-4 hover:underline">{inc.risk_code}</Link> : <span className="text-muted">None</span>}</Detail>
                  {inc.source_id && (
                    <Detail label="Source record">
                      <span className="num">{inc.source_id}</span>
                      <span className="text-muted"> in {inc.source_system}</span>
                      {inc.source_occurred_at && <div className="text-[13px] text-muted">Original date <span className="num">{inc.source_occurred_at}</span> (the dates in this demo are shifted)</div>}
                    </Detail>
                  )}
                </dl>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Assignment</h2>
                <Field label="Assignee" error={errors.assigned_to}>
                  {(f) => <PersonPicker id={f.id} value={assigneeValue} initialLabel={inc.assigned_to_name ?? undefined} onChange={setAssignee} disabled={Boolean(assignReason)} invalid={f['aria-invalid']} />}
                </Field>
                <Button onClick={saveAssign} disabledReason={assignReason}>{inc.assigned_to ? 'Reassign' : 'Assign'}</Button>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Linked risk</h2>
                <Field label="Risk" error={errors.risk_id}>
                  {(f) => <RiskPicker id={f.id} value={riskValue} onChange={setRiskId} disabled={!pLink.allowed || closed} invalid={f['aria-invalid']} />}
                </Field>
                <div className="flex gap-2">
                  <Button onClick={() => saveLink(riskValue ? Number(riskValue) : null)} disabledReason={linkReason}>{inc.risk_id ? 'Change link' : 'Link risk'}</Button>
                  {inc.risk_id && <Button variant="ghost" onClick={() => saveLink(null)} disabledReason={linkReason}>Unlink</Button>}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Add update</h2>
                <UpdateComposer incident={inc} onSaved={setData} />
              </Card>
            </div>

            <Card className="h-fit min-w-0 p-5">
              <h2 className="mb-4 text-[15px] font-semibold">Timeline, newest first</h2>
              <UpdateTimeline updates={inc.updates} />
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

/** One row of the Details list: a muted label and its value. */
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[14.5px]">{children}</dd>
    </>
  );
}
