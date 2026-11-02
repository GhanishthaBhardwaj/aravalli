import { useState } from 'react';
import type { Incident, IncidentStatus } from '../../domain/types';
import { INCIDENT_TRANSITIONS, incidentNeedsNote } from '../../domain/transitions';
import { canClose, permit } from '../../domain/permissions';
import type { Errors } from '../../domain/validation';
import { addIncidentUpdate } from '../../data/store';
import { useData, useToast } from '../../app/providers';
import { Field, Select, Textarea } from '../ui/fields';
import { Button } from '../ui/Button';

export function UpdateComposer({ incident }: { incident: Incident }) {
  const { act, actor } = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [to, setTo] = useState<IncidentStatus | ''>('');
  const [errors, setErrors] = useState<Errors>({});

  const p = permit(actor, 'incident.update', incident);
  const next = INCIDENT_TRANSITIONS[incident.status].filter((s) => s !== 'Closed' || canClose(actor).allowed);
  const needsNote = to !== '' && incidentNeedsNote(to);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act((ds, who) => addIncidentUpdate(ds, incident.incident_id, text, to || null, who));
    if (!r.ok) return setErrors(r.errors);
    setText(''); setTo(''); setErrors({});
    toast.push('Update saved (demo)');
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {errors._form && <p role="alert" className="text-[var(--sev-critical)]">{errors._form}</p>}
      <Field label={needsNote ? 'Resolution note' : 'Note'} required error={errors.update_text}>
        {(f) => <Textarea {...f} rows={3} disabled={!p.allowed} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, what was done, what is next…" />}
      </Field>
      <Field
        label="Change status"
        error={errors.status_to}
        hint={next.length ? undefined : incident.status === 'Closed' ? 'Closed incidents are final.' : 'No status changes available to you.'}
      >
        {(f) => (
          <Select
            {...f}
            disabled={!p.allowed || next.length === 0}
            value={to}
            onChange={(e) => setTo(e.target.value as IncidentStatus | '')}
            placeholder={`No change (stay ${incident.status})`}
            options={next.map((s) => ({ value: s, label: s === 'Investigating' && incident.status === 'Resolved' ? 'Investigating (reopen)' : s }))}
          />
        )}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabledReason={p.allowed ? undefined : p.reason}>
          Post update
        </Button>
      </div>
    </form>
  );
}
