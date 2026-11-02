import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { NotFound } from './NotFound';
import { assessmentsFor, fullName, riskRows } from '../data/selectors';
import { changeRiskStatus, hasAssessment } from '../data/store';
import { type Errors, permit, riskNeedsNote, type RiskStatus, riskTransitions } from '@aravalli/shared';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Field, Select, Textarea } from '../components/ui/fields';
import { StatusChip, SeverityChip } from '../components/ui/Chip';
import { CodeLink, Fact, Panel } from '../components/ui/misc';
import { Table } from '../components/ui/Table';
import { AssessmentForm } from '../components/risk/AssessmentForm';
import { AssessmentHistory } from '../components/risk/AssessmentHistory';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { fmtDate } from '../app/format';

export function RiskDetail() {
  const { code } = useParams();
  const { ds, actor, act } = useData();
  const toast = useToast();
  const [assessOpen, setAssessOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [to, setTo] = useState<RiskStatus | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const row = riskRows(ds).find((r) => r.risk.risk_code === code);
  if (!row) return <NotFound what="risk" />;
  const { risk } = row;
  const history = assessmentsFor(ds, risk.risk_id);
  const linked = ds.incidents.filter((i) => i.risk_id === risk.risk_id);
  const next = riskTransitions(risk.status, hasAssessment(ds, risk.risk_id));
  const pAssess = permit(actor, 'risk.assess');
  const pStatus = permit(actor, 'risk.status');

  const saveStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return setErrors({ status: 'Choose a status.' });
    const r = act((d, who) => changeRiskStatus(d, risk.risk_id, to, note, who));
    if (!r.ok) return setErrors(r.errors);
    toast.push(`Status changed to ${to} (demo)`);
    setStatusOpen(false); setTo(''); setNote(''); setErrors({});
  };

  return (
    <Page
      title={`${risk.risk_code} · ${risk.title}`}
      actions={
        <>
          <Button onClick={() => setStatusOpen(true)} disabledReason={pStatus.allowed ? undefined : pStatus.reason}>Change status</Button>
          <Button variant="primary" onClick={() => setAssessOpen(true)} disabledReason={pAssess.allowed ? undefined : pAssess.reason}>New assessment</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="mono text-sm font-medium">{risk.risk_code}</span>
        <StatusChip status={risk.status} />
        <ScoreBadge score={row.score} band={row.band} />
        {row.current && <span className="text-[13px] text-muted">L{row.current.likelihood} × I{row.current.impact}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel title="Facts">
            <dl className="space-y-3">
              <Fact label="Owner">{fullName(row.owner)} <span className="text-muted">— {row.owner.job_title}</span></Fact>
              <Fact label="Department">{row.department.name}</Fact>
              <Fact label="Category">{risk.category}</Fact>
              <Fact label="Identified">{fmtDate(risk.identified_date)}</Fact>
              <Fact label="Last assessed">{fmtDate(row.lastAssessed)}</Fact>
              <Fact label="Description"><p className="text-[13px]">{risk.description}</p></Fact>
            </dl>
          </Panel>
          <Panel title={`Linked incidents (${linked.length})`} flush>
            {linked.length ? (
              <Table
                rows={linked}
                rowKey={(i) => i.incident_id}
                rowHref={(i) => `/incidents/${i.incident_code}`}
                caption="Incidents linked to this risk"
                columns={[
                  { key: 'c', header: 'Code', render: (i) => <CodeLink to={`/incidents/${i.incident_code}`}>{i.incident_code}</CodeLink> },
                  { key: 's', header: 'Severity', render: (i) => <SeverityChip severity={i.severity} /> },
                  { key: 'st', header: 'Status', render: (i) => <StatusChip status={i.status} /> },
                ]}
              />
            ) : (
              <p className="p-4 text-[13px] text-muted">No linked incidents.</p>
            )}
          </Panel>
        </div>
        <div>
          {history.length ? (
            <AssessmentHistory assessments={history} employees={ds.employees} />
          ) : (
            <div className="panel p-6 text-center text-muted">Not assessed yet.</div>
          )}
        </div>
      </div>

      <Drawer open={assessOpen} title={`New assessment · ${risk.risk_code}`} onClose={() => setAssessOpen(false)}>
        <AssessmentForm riskId={risk.risk_id} onDone={() => setAssessOpen(false)} />
      </Drawer>

      <Drawer open={statusOpen} title={`Change status · ${risk.risk_code}`} onClose={() => setStatusOpen(false)}>
        <form onSubmit={saveStatus} noValidate className="space-y-3">
          <p className="text-[13px]">Current status: <StatusChip status={risk.status} /></p>
          <Field label="New status" required error={errors.status}>
            {(f) => <Select {...f} value={to} onChange={(e) => setTo(e.target.value as RiskStatus)} placeholder="Select…" options={next.map((s) => ({ value: s, label: risk.status === 'Closed' ? `${s} (reopen)` : s }))} />}
          </Field>
          <Field label={to && riskNeedsNote(to) ? 'Closure note' : 'Note'} required={Boolean(to && riskNeedsNote(to))} error={errors.note}>
            {(f) => <Textarea {...f} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {errors._form && <p role="alert" className="text-[var(--sev-critical)]">{errors._form}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save status</Button>
          </div>
        </form>
      </Drawer>
    </Page>
  );
}
