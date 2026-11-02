import { useState } from 'react';
import { bandFor, computeScore, type Errors, IMPACT_LABELS, LIKELIHOOD_LABELS, type RiskDetail } from '@aravalli/shared';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Field, Input, Textarea } from '../ui/fields';
import { Button } from '../ui/Button';
import { ScoreBadge } from './ScoreBadge';
import { api, fieldErrors } from '../../api/client';
import { useSession, useToast } from '../../app/providers';

interface PickerProps {
  likelihood: number | null;
  impact: number | null;
  onL: (v: number | null) => void;
  onI: (v: number | null) => void;
  errors?: Errors;
  clearable?: boolean;
}

/** Likelihood and impact controls with a live score preview. */
export function ScorePicker({ likelihood, impact, onL, onI, errors = {}, clearable }: PickerProps) {
  const score = likelihood && impact ? computeScore(likelihood, impact) : null;
  return (
    <div className="space-y-3">
      <SegmentedControl legend="Likelihood" labels={LIKELIHOOD_LABELS} value={likelihood} onChange={onL} error={errors.likelihood} clearable={clearable} />
      <SegmentedControl legend="Impact" labels={IMPACT_LABELS} value={impact} onChange={onI} error={errors.impact} clearable={clearable} />
      <div className="flex min-h-[48px] items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-2" aria-live="polite">
        <span className="text-[14px] text-muted">Score</span>
        {score ? <ScoreBadge score={score} band={bandFor(score)} /> : <span className="text-[14px] text-subtle">Choose likelihood and impact</span>}
      </div>
    </div>
  );
}

export function AssessmentForm({ riskId, onDone, onSaved }: { riskId: number; onDone: () => void; onSaved: (updated: RiskDetail) => void }) {
  const { clock } = useSession();
  const toast = useToast();
  const [l, setL] = useState<number | null>(null);
  const [i, setI] = useState<number | null>(null);
  const [date, setDate] = useState(clock.today());
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await api.addAssessment(riskId, { likelihood: l, impact: i, assessment_date: date, mitigation_notes: notes }));
      toast.push('Assessment saved');
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      {errors._form && <p role="alert" className="text-[14px] font-medium">{errors._form}</p>}
      <ScorePicker likelihood={l} impact={i} onL={setL} onI={setI} errors={errors} />
      <Field label="Assessment date" required error={errors.assessment_date}>
        {(p) => <Input {...p} type="date" max={clock.today()} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Mitigation notes">
        {(p) => <Textarea {...p} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save assessment'}</Button>
      </div>
    </form>
  );
}
