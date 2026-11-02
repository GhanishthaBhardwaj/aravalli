import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { reportIncident } from '../data/store';
import { permit } from '../domain/permissions';
import { SEVERITIES } from '../domain/types';
import { DEMO_NOW } from '../domain/validation';
import type { Errors } from '../domain/validation';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/fields';
import { Panel, SearchableSelect } from '../components/ui/misc';
import { AssigneeSelect } from '../components/incident/AssigneeSelect';

export function IncidentNew() {
  const { ds, actor, act } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('');
  const [dept, setDept] = useState<number | null>(null);
  const [occurred, setOccurred] = useState('');
  const [assignee, setAssignee] = useState<number | null>(null);
  const [riskId, setRiskId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const p = permit(actor, 'incident.report');
  const riskOpts = useMemo(
    () => ds.risks.map((r) => ({ value: String(r.risk_id), label: r.title, hint: r.risk_code })),
    [ds.risks],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act((d, who) =>
      reportIncident(d, { title, description, severity, department_id: dept, occurred_at: occurred, assigned_to: assignee, risk_id: riskId ? Number(riskId) : null }, who),
    );
    if (!r.ok) return setErrors(r.errors);
    toast.push(`Incident ${r.value.incident_code} reported (demo)`);
    nav(`/incidents/${r.value.incident_code}`);
  };

  return (
    <Page title="Report incident" description="Describe what happened. You can assign it and link a risk now or later.">
      {!p.allowed && <p role="alert" className="panel mb-4 p-3 text-[13px]">{p.reason}</p>}
      <form onSubmit={submit} noValidate className="max-w-3xl">
        <Panel title="Incident details">
          <fieldset disabled={!p.allowed} className="space-y-1">
            <Field label="Title" required error={errors.title}>
              {(f) => <Input {...f} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Description" required error={errors.description}>
              {(f) => <Textarea {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Severity" required error={errors.severity}>
                {(f) => <Select {...f} value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="Select…" options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />}
              </Field>
              <Field label="Occurred (date and time)" required error={errors.occurred_at}>
                {(f) => <Input {...f} type="datetime-local" max={DEMO_NOW} value={occurred} onChange={(e) => setOccurred(e.target.value)} />}
              </Field>
              <Field label="Affected department" required error={errors.department_id}>
                {(f) => <Select {...f} value={dept ?? ''} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : null)} placeholder="Select…" options={ds.departments.map((d) => ({ value: String(d.department_id), label: d.name }))} />}
              </Field>
              <Field label="Assignee (optional)" error={errors.assigned_to}>
                {(f) => <AssigneeSelect id={f.id} employees={ds.employees} value={assignee} onChange={setAssignee} invalid={f['aria-invalid']} />}
              </Field>
            </div>
            <Field label="Linked risk (optional)" error={errors.risk_id} hint="Search by risk code or title.">
              {(f) => <SearchableSelect id={f.id} options={riskOpts} value={riskId} onChange={setRiskId} placeholder="No linked risk" invalid={f['aria-invalid']} />}
            </Field>
          </fieldset>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => nav('/incidents')}>Cancel</Button>
            <Button type="submit" variant="primary" disabledReason={p.allowed ? undefined : p.reason}>Report incident</Button>
          </div>
        </Panel>
      </form>
    </Page>
  );
}
