import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Errors, permit, SEVERITIES } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { api, fieldErrors } from '../api/client';
import { useApi } from '../api/useApi';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/fields';
import { Section } from '../components/ui/layout';
import { PersonPicker } from '../components/ui/PersonPicker';
import { RiskPicker } from '../components/ui/RiskPicker';

export function IncidentNew() {
  const { actor, clock } = useSession();
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
  const [saving, setSaving] = useState(false);

  const departments = useApi((signal) => api.departments(signal), []);
  const p = permit(actor, 'incident.report');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const inc = await api.reportIncident({
        title, description, severity, department_id: dept, occurred_at: occurred, assigned_to: assignee, risk_id: riskId ? Number(riskId) : null,
      });
      toast.push(`Incident ${inc.incident_code} reported`);
      nav(`/incidents/${inc.incident_code}`);
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Report incident">
      {!p.allowed && <p role="alert" className="mb-8 border-l-2 border-fg pl-4 text-[15px]">{p.reason}</p>}
      <form onSubmit={submit} noValidate className="max-w-2xl">
        <Section title="Incident details">
          {errors._form && <p role="alert" className="mb-3 text-[14px] font-medium">{errors._form}</p>}
          <fieldset disabled={!p.allowed} className="space-y-1">
            <Field label="Title" required error={errors.title}>
              {(f) => <Input {...f} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Description" required error={errors.description}>
              {(f) => <Textarea {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Severity" required error={errors.severity}>
                {(f) => <Select {...f} value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="Select…" options={[...SEVERITIES].reverse().map((s) => ({ value: s, label: s }))} />}
              </Field>
              <Field label="Occurred (date and time)" required error={errors.occurred_at}>
                {(f) => <Input {...f} type="datetime-local" max={clock.now()} value={occurred} onChange={(e) => setOccurred(e.target.value)} />}
              </Field>
              <Field label="Affected department" required error={errors.department_id}>
                {(f) => <Select {...f} value={dept ?? ''} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : null)} placeholder="Select…" options={(departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }))} />}
              </Field>
              <Field label="Assignee (optional)" error={errors.assigned_to}>
                {(f) => <PersonPicker id={f.id} value={assignee} onChange={setAssignee} invalid={f['aria-invalid']} />}
              </Field>
            </div>
            <Field label="Linked risk (optional)" error={errors.risk_id}>
              {(f) => <RiskPicker id={f.id} value={riskId} onChange={setRiskId} invalid={f['aria-invalid']} />}
            </Field>
          </fieldset>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => nav('/incidents')}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving} disabledReason={p.allowed ? undefined : p.reason}>{saving ? 'Reporting…' : 'Report incident'}</Button>
          </div>
        </Section>
      </form>
    </Page>
  );
}
