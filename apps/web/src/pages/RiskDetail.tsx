import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { type Errors, permit, riskNeedsNote, type RiskStatus, riskTransitions } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { fmtDate } from '../app/format';
import { NotFound } from './NotFound';
import { assessmentsFor, fullName, riskRows } from '../data/selectors';
import { changeRiskStatus, hasAssessment } from '../data/store';
import { AssessmentForm } from '../components/risk/AssessmentForm';
import { AssessmentTable, ScoreChart } from '../components/risk/AssessmentHistory';
import { ScoreBadge } from '../components/risk/ScoreBadge';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Select, Textarea } from '../components/ui/fields';
import { Card, Fact, IdLink, Section } from '../components/ui/layout';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/states';
import { Table } from '../components/ui/Table';
import { TabPanel, Tabs } from '../components/ui/Tabs';

type Tab = 'assessments' | 'incidents';

export function RiskDetail() {
  const { code } = useParams();
  const { ds, actor, act } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('assessments');
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

  const closeStatus = () => { setStatusOpen(false); setTo(''); setNote(''); setErrors({}); };
  const saveStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!to) return setErrors({ status: 'Choose a status.' });
    const r = act((d, who, c) => changeRiskStatus(d, risk.risk_id, to, note, who, c));
    if (!r.ok) return setErrors(r.errors);
    toast.push(`Status changed to ${to}`);
    closeStatus();
  };

  return (
    <Page
      title={risk.title}
      code={risk.risk_code}
      actions={
        <>
          <Button onClick={() => setStatusOpen(true)} disabledReason={pStatus.allowed ? undefined : pStatus.reason}>Change status</Button>
          <Button variant="primary" onClick={() => setAssessOpen(true)} disabledReason={pAssess.allowed ? undefined : pAssess.reason}>New assessment</Button>
        </>
      }
    >
      <div className="-mt-6 mb-12 flex flex-wrap items-center gap-x-5 gap-y-2">
        <StatusBadge status={risk.status} />
        <ScoreBadge score={row.score} band={row.band} />
        {row.current && <span className="num text-[14px] text-muted">L{row.current.likelihood} × I{row.current.impact}</span>}
      </div>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Section title="Details" className="min-w-0">
          <dl className="space-y-5">
            <Fact label="Owner">{fullName(row.owner)} <span className="text-muted">— {row.owner.job_title}</span></Fact>
            <Fact label="Department">{row.department.name}</Fact>
            <Fact label="Category">{risk.category}</Fact>
            <Fact label="Identified">{fmtDate(risk.identified_date)}</Fact>
            <Fact label="Last assessed">{fmtDate(row.lastAssessed)}</Fact>
            <Fact label="Description"><p className="text-[14px] leading-6 text-muted">{risk.description}</p></Fact>
          </dl>
        </Section>

        <div className="min-w-0">
          <Tabs
            label="Risk record"
            value={tab}
            onChange={setTab}
            tabs={[{ id: 'assessments', label: 'Assessments', count: history.length }, { id: 'incidents', label: 'Linked incidents', count: linked.length }]}
          />
          <TabPanel>
            {tab === 'assessments' ? (
              history.length ? (
                <div className="space-y-10">
                  {history.length > 1 && <Section title="Score over time"><ScoreChart assessments={history} /></Section>}
                  <Section title={`Assessment history (${history.length})`}>
                    <Card className="overflow-hidden"><AssessmentTable assessments={history} employees={ds.employees} /></Card>
                  </Section>
                </div>
              ) : (
                <EmptyState title="Not assessed yet" body="Score likelihood and impact to give this risk a position on the heat map." />
              )
            ) : linked.length ? (
              <Card className="overflow-hidden">
                <Table
                  rows={linked}
                  rowKey={(i) => i.incident_id}
                  rowHref={(i) => `/incidents/${i.incident_code}`}
                  caption="Incidents linked to this risk"
                  columns={[
                    { key: 'c', header: 'Code', render: (i) => <IdLink to={`/incidents/${i.incident_code}`}>{i.incident_code}</IdLink> },
                    { key: 't', header: 'Incident', render: (i) => <span className="block max-w-[40ch] truncate font-medium">{i.title}</span> },
                    { key: 's', header: 'Severity', render: (i) => <SeverityBadge severity={i.severity} /> },
                    { key: 'st', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
                  ]}
                />
              </Card>
            ) : (
              <EmptyState title="No linked incidents" body="Incidents that relate to this risk will appear here once they are linked." />
            )}
          </TabPanel>
        </div>
      </div>

      <Modal open={assessOpen} title="New assessment" description={risk.risk_code} onClose={() => setAssessOpen(false)}>
        <AssessmentForm riskId={risk.risk_id} onDone={() => setAssessOpen(false)} />
      </Modal>

      <Modal open={statusOpen} title="Change status" description={`${risk.risk_code} is ${risk.status}`} onClose={closeStatus}>
        <form onSubmit={saveStatus} noValidate className="space-y-1">
          <Field label="New status" required error={errors.status}>
            {(f) => <Select {...f} value={to} onChange={(e) => setTo(e.target.value as RiskStatus)} placeholder="Select…" options={next.map((s) => ({ value: s, label: risk.status === 'Closed' ? `${s} (reopen)` : s }))} />}
          </Field>
          <Field label={to && riskNeedsNote(to) ? 'Closure note' : 'Note'} required={Boolean(to && riskNeedsNote(to))} error={errors.note}>
            {(f) => <Textarea {...f} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          {errors._form && <p role="alert" className="text-[14px] font-medium">{errors._form}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeStatus}>Cancel</Button>
            <Button type="submit" variant="primary">Save status</Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
