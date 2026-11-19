import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { type Errors, permit, riskNeedsNote, type RiskStatus, riskTransitions } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { SAMPLE_REGISTER } from './RiskRegister';
import { fmtDate } from '../app/format';
import { NotFound } from './NotFound';
import { api, fieldErrors } from '../api/client';
import { isNotFound, useApi } from '../api/useApi';
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
  const { code = '' } = useParams();
  const { actor, organisation } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('assessments');
  const [assessOpen, setAssessOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [to, setTo] = useState<RiskStatus | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const { data: risk, loading, error, reload, setData } = useApi((signal) => api.risk(code, signal), [code]);
  const linked = useApi(
    (signal) => (risk ? api.incidents({ risk_id: risk.risk_id, limit: 50, sort: 'reported_at', order: 'desc' }, signal) : Promise.resolve(null)),
    [risk?.risk_id, risk?.linked_incident_count],
  );

  if (isNotFound(error)) return <NotFound what="risk" />;
  const pAssess = permit(actor, 'risk.assess');
  const pStatus = permit(actor, 'risk.status');
  const history = risk?.assessments ?? [];
  const next = risk ? riskTransitions(risk.status, history.length > 0) : [];
  const band = risk && risk.severity_band !== 'Unrated' ? risk.severity_band : null;

  const closeStatus = () => { setStatusOpen(false); setTo(''); setNote(''); setErrors({}); };
  const saveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!risk) return;
    if (!to) return setErrors({ status: 'Choose a status.' });
    setSaving(true);
    try {
      setData(await api.changeRiskStatus(risk.risk_id, to, note));
      toast.push(`Status changed to ${to}`);
      closeStatus();
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title={risk?.title ?? code}
      code={risk?.risk_code ?? code}
      description={organisation.data_note ? SAMPLE_REGISTER : undefined}
      loading={loading}
      error={error}
      onRetry={reload}
      actions={
        <>
          <Button onClick={() => setStatusOpen(true)} disabledReason={pStatus.allowed ? undefined : pStatus.reason}>Change status</Button>
          <Button variant="primary" onClick={() => setAssessOpen(true)} disabledReason={pAssess.allowed ? undefined : pAssess.reason}>New assessment</Button>
        </>
      }
    >
      {risk && (
        <>
          <div className="-mt-6 mb-12 flex flex-wrap items-center gap-x-5 gap-y-2">
            <StatusBadge status={risk.status} />
            <ScoreBadge score={risk.risk_score} band={band} />
            {risk.likelihood !== null && <span className="num text-[14px] text-muted">L{risk.likelihood} × I{risk.impact}</span>}
          </div>

          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Section title="Details" className="min-w-0">
              <dl className="space-y-5">
                <Fact label="Owner">{risk.owner_name}</Fact>
                <Fact label="Department">{risk.department_name}</Fact>
                <Fact label="Category">{risk.category}</Fact>
                <Fact label="Identified">{fmtDate(risk.identified_date)}</Fact>
                <Fact label="Last assessed">{fmtDate(risk.last_assessed)}</Fact>
                <Fact label="Description"><p className="text-[14px] leading-6 text-muted">{risk.description}</p></Fact>
              </dl>
            </Section>

            <div className="min-w-0">
              <Tabs
                label="Risk record"
                value={tab}
                onChange={setTab}
                tabs={[{ id: 'assessments', label: 'Assessments', count: history.length }, { id: 'incidents', label: 'Linked incidents', count: risk.linked_incident_count }]}
              />
              <TabPanel>
                {tab === 'assessments' ? (
                  history.length ? (
                    <div className="space-y-10">
                      {history.length > 1 && <Section title="Score over time"><ScoreChart assessments={history} /></Section>}
                      <Section title={`Assessment history (${history.length})`}>
                        <Card className="overflow-hidden"><AssessmentTable assessments={history} /></Card>
                      </Section>
                    </div>
                  ) : (
                    <EmptyState title="Not assessed yet" body="Score likelihood and impact to give this risk a position on the heat map." />
                  )
                ) : risk.linked_incident_count === 0 ? (
                  <EmptyState title="No linked incidents" body="Incidents that relate to this risk will appear here once they are linked." />
                ) : (
                  <Card className="overflow-hidden">
                    <Table
                      rows={linked.data?.data ?? []}
                      loading={linked.loading}
                      error={linked.error?.message}
                      onRetry={linked.reload}
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
                    {linked.data && linked.data.page.total > linked.data.data.length && (
                      <p className="border-t border-line px-4 py-3 text-[13px] text-muted">Showing the {linked.data.data.length} most recent of {linked.data.page.total}.</p>
                    )}
                  </Card>
                )}
              </TabPanel>
            </div>
          </div>

          <Modal open={assessOpen} title="New assessment" description={risk.risk_code} onClose={() => setAssessOpen(false)}>
            <AssessmentForm riskId={risk.risk_id} onDone={() => setAssessOpen(false)} onSaved={setData} />
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
                <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save status'}</Button>
              </div>
            </form>
          </Modal>
        </>
      )}
    </Page>
  );
}
