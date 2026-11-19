import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Errors, permit, RISK_CATEGORIES } from '@aravalli/shared';
import { Page } from '../app/Page';
import { useSession, useToast } from '../app/providers';
import { api, fieldErrors } from '../api/client';
import { useApi } from '../api/useApi';
import { ScorePicker } from '../components/risk/AssessmentForm';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/fields';
import { Section } from '../components/ui/layout';
import { PersonPicker } from '../components/ui/PersonPicker';

export function RiskNew() {
  const { actor, clock } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [dept, setDept] = useState<number | null>(null);
  const [owner, setOwner] = useState<number | null>(null);
  const [date, setDate] = useState(clock.today());
  const [l, setL] = useState<number | null>(null);
  const [i, setI] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const departments = useApi((signal) => api.departments(signal), []);
  const p = permit(actor, 'risk.register');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const risk = await api.registerRisk({
        title, description, category, department_id: dept, owner_employee_id: owner, identified_date: date, likelihood: l, impact: i, mitigation_notes: notes,
      });
      toast.push(`Risk ${risk.risk_code} registered`);
      nav(`/risks/${risk.risk_code}`);
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Register risk">
      {!p.allowed && <p role="alert" className="mb-8 border-l-2 border-fg pl-4 text-[15px]">{p.reason}</p>}
      <form onSubmit={submit} noValidate className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Section title="Details">
          {errors._form && <p role="alert" className="mb-3 text-[14px] font-medium">{errors._form}</p>}
          <fieldset disabled={!p.allowed} className="space-y-1">
            <Field label="Title" required error={errors.title}>
              {(f) => <Input {...f} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Description" required error={errors.description}>
              {(f) => <Textarea {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Category" required error={errors.category}>
                {(f) => <Select {...f} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Select…" options={RISK_CATEGORIES.map((c) => ({ value: c, label: c }))} />}
              </Field>
              <Field label="Identified date" required error={errors.identified_date}>
                {(f) => <Input {...f} type="date" max={clock.today()} value={date} onChange={(e) => setDate(e.target.value)} />}
              </Field>
              <Field label="Department" required error={errors.department_id}>
                {(f) => (
                  <Select {...f} value={dept ?? ''} placeholder="Select…"
                    onChange={(e) => setDept(e.target.value ? Number(e.target.value) : null)}
                    options={(departments.data ?? []).map((d) => ({ value: String(d.department_id), label: d.name }))} />
                )}
              </Field>
              <Field label="Owner" required error={errors.owner_employee_id}>
                {(f) => <PersonPicker id={f.id} value={owner} onChange={setOwner} placeholder="Search people" invalid={f['aria-invalid']} />}
              </Field>
            </div>
          </fieldset>
        </Section>

        <Section title="Initial score (optional)">
          <fieldset disabled={!p.allowed} className="space-y-2">
            <ScorePicker likelihood={l} impact={i} onL={setL} onI={setI} errors={errors} clearable />
            <Field label="Mitigation notes">
              {(f) => <Textarea {...f} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </fieldset>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => nav('/risks')}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving} disabledReason={p.allowed ? undefined : p.reason}>{saving ? 'Saving…' : 'Register risk'}</Button>
          </div>
        </Section>
      </form>
    </Page>
  );
}
