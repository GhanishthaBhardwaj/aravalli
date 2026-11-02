import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '../app/Page';
import { useData, useToast } from '../app/providers';
import { registerRisk } from '../data/store';
import { DEMO_TODAY, type Errors, permit, RISK_CATEGORIES } from '@aravalli/shared';
import { Button } from '../components/ui/Button';
import { Field, Input, Select, Textarea } from '../components/ui/fields';
import { Panel } from '../components/ui/misc';
import { ScorePicker } from '../components/risk/AssessmentForm';

export function RiskNew() {
  const { ds, actor, act } = useData();
  const toast = useToast();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [dept, setDept] = useState<number | null>(null);
  const [owner, setOwner] = useState<number | null>(null);
  const [date, setDate] = useState(DEMO_TODAY);
  const [l, setL] = useState<number | null>(null);
  const [i, setI] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const p = permit(actor, 'risk.register');
  const owners = ds.employees.filter((e) => e.is_active && e.department_id === dept);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act((d, who) =>
      registerRisk(d, { title, description, category, department_id: dept, owner_employee_id: owner, identified_date: date, likelihood: l, impact: i, mitigation_notes: notes }, who),
    );
    if (!r.ok) return setErrors(r.errors);
    toast.push(`Risk ${r.value.risk_code} registered (demo)`);
    nav(`/risks/${r.value.risk_code}`);
  };

  return (
    <Page title="Register risk" description="Add a risk to the register, with an optional first score.">
      {!p.allowed && <p role="alert" className="panel mb-4 p-3 text-[13px]">{p.reason} Switch the “Acting as” user to register a risk.</p>}
      <form onSubmit={submit} noValidate className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title="Risk details">
          {errors._form && <p role="alert" className="mb-2 text-[var(--sev-critical)]">{errors._form}</p>}
          <fieldset disabled={!p.allowed} className="space-y-1">
            <Field label="Title" required error={errors.title}>
              {(f) => <Input {...f} value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />}
            </Field>
            <Field label="Description" required error={errors.description}>
              {(f) => <Textarea {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="Category" required error={errors.category}>
                {(f) => <Select {...f} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Select…" options={RISK_CATEGORIES.map((c) => ({ value: c, label: c }))} />}
              </Field>
              <Field label="Identified date" required error={errors.identified_date}>
                {(f) => <Input {...f} type="date" max={DEMO_TODAY} value={date} onChange={(e) => setDate(e.target.value)} />}
              </Field>
              <Field label="Department" required error={errors.department_id}>
                {(f) => (
                  <Select {...f} value={dept ?? ''} placeholder="Select…"
                    onChange={(e) => { setDept(e.target.value ? Number(e.target.value) : null); setOwner(null); }}
                    options={ds.departments.map((d) => ({ value: String(d.department_id), label: d.name }))} />
                )}
              </Field>
              <Field label="Owner" required error={errors.owner_employee_id} hint={dept ? undefined : 'Choose a department first.'}>
                {(f) => (
                  <Select {...f} disabled={!dept} value={owner ?? ''} placeholder="Select…" onChange={(e) => setOwner(e.target.value ? Number(e.target.value) : null)}
                    options={owners.map((o) => ({ value: String(o.employee_id), label: `${o.first_name} ${o.last_name} — ${o.job_title}` }))} />
                )}
              </Field>
            </div>
          </fieldset>
        </Panel>
        <Panel title="Initial score (optional)">
          <fieldset disabled={!p.allowed} className="space-y-3">
            <ScorePicker likelihood={l} impact={i} onL={setL} onI={setI} errors={errors} clearable />
            <Field label="Mitigation notes">
              {(f) => <Textarea {...f} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button onClick={() => nav('/risks')}>Cancel</Button>
            <Button type="submit" variant="primary" disabledReason={p.allowed ? undefined : p.reason}>Register risk</Button>
          </div>
        </Panel>
      </form>
    </Page>
  );
}
