import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type Errors, isIncidentFinal, permit } from '@aravalli/shared';
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
import { Fact, Section } from '../components/ui/layout';
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

  return (
    <Page title={inc?.title ?? code} code={inc?.incident_code ?? code} loading={loading} error={error} onRetry={reload}>
      {inc && (
        <>
          <div className="-mt-6 mb-12 flex flex-wrap items-center gap-x-5 gap-y-2">
            <SeverityBadge severity={inc.severity} />
            <StatusBadge status={inc.status} />
            <span className="text-[14px] text-muted">{['Resolved', 'Closed'].includes(inc.status) ? 'Resolved after' : 'Open for'} <span className="num">{days}</span> {days === 1 ? 'day' : 'days'}</span>
          </div>

          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="min-w-0 space-y-12">
              <Section title="Details">
                <dl className="space-y-5">
                  <Fact label="Department">{inc.department_name}</Fact>
                  <Fact label="Reported by">{inc.reported_by_name}</Fact>
                  <Fact label="Assigned to">{inc.assigned_to_name ?? <span className="text-subtle">Unassigned</span>}</Fact>
                  <Fact label="Linked risk">{inc.risk_code ? <Link to={`/risks/${inc.risk_code}`} className="num text-[14px] underline underline-offset-4">{inc.risk_code}</Link> : <span className="text-subtle">None</span>}</Fact>
                  <Fact label="Occurred">{fmtDateTime(inc.occurred_at)}</Fact>
                  <Fact label="Reported">{fmtDateTime(inc.reported_at)}</Fact>
                  <Fact label="Resolved">{fmtDateTime(inc.resolved_at)}</Fact>
                  {inc.source_system && <Fact label="Source record"><span className="num text-[14px]">{inc.source_id}</span> <span className="text-muted">in {inc.source_system}</span></Fact>}
                  <Fact label="Description"><p className="text-[14px] leading-6 text-muted">{inc.description}</p></Fact>
                </dl>
              </Section>

              <Section title="Assignment">
                <Field label="Assignee" error={errors.assigned_to}>
                  {(f) => <PersonPicker id={f.id} value={assigneeValue} initialLabel={inc.assigned_to_name ?? undefined} onChange={setAssignee} disabled={Boolean(assignReason)} invalid={f['aria-invalid']} />}
                </Field>
                <Button onClick={saveAssign} disabledReason={assignReason}>{inc.assigned_to ? 'Reassign' : 'Assign'}</Button>
              </Section>

              <Section title="Linked risk">
                <Field label="Risk" error={errors.risk_id}>
                  {(f) => <RiskPicker id={f.id} value={riskValue} onChange={setRiskId} disabled={!pLink.allowed || closed} invalid={f['aria-invalid']} />}
                </Field>
                <div className="flex gap-2">
                  <Button onClick={() => saveLink(riskValue ? Number(riskValue) : null)} disabledReason={linkReason}>{inc.risk_id ? 'Change link' : 'Link risk'}</Button>
                  {inc.risk_id && <Button variant="ghost" onClick={() => saveLink(null)} disabledReason={linkReason}>Unlink</Button>}
                </div>
              </Section>
            </div>

            <div className="min-w-0 space-y-12">
              <Section title="Add update"><UpdateComposer incident={inc} onSaved={setData} /></Section>
              <Section title="Timeline, newest first">
                <UpdateTimeline updates={inc.updates} />
              </Section>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
