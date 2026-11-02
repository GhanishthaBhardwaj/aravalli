import { useState } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Field, Input, Textarea } from '../ui/fields';
import { Button } from '../ui/Button';
import { SeverityChip } from '../ui/Chip';
import { bandFor, computeScore, DEMO_TODAY, type Errors, IMPACT_LABELS, LIKELIHOOD_LABELS } from '@aravalli/shared';
import { addAssessment } from '../../data/store';
import { useData, useToast } from '../../app/providers';

interface PickerProps {
  likelihood: number | null;
  impact: number | null;
  onL: (v: number | null) => void;
  onI: (v: number | null) => void;
  errors?: Errors;
  clearable?: boolean;
}

/** Likelihood + impact segmented controls with a live score preview. */
export function ScorePicker({ likelihood, impact, onL, onI, errors = {}, clearable }: PickerProps) {
  const score = likelihood && impact ? computeScore(likelihood, impact) : null;
  return (
    <div className="space-y-3">
      <SegmentedControl legend="Likelihood" labels={LIKELIHOOD_LABELS} value={likelihood} onChange={onL} error={errors.likelihood} clearable={clearable} />
      <SegmentedControl legend="Impact" labels={IMPACT_LABELS} value={impact} onChange={onI} error={errors.impact} clearable={clearable} />
      <div className="flex items-center gap-2 rounded-md border border-line bg-page px-3 py-2" aria-live="polite">
        <span className="section-title">Score</span>
        {score ? (
          <>
            <span className="mono text-base font-semibold">{score}</span>
            <SeverityChip severity={bandFor(score)} />
          </>
        ) : (
          <span className="text-muted">Select likelihood and impact</span>
        )}
      </div>
    </div>
  );
}

export function AssessmentForm({ riskId, onDone }: { riskId: number; onDone: () => void }) {
  const { act } = useData();
  const toast = useToast();
  const [l, setL] = useState<number | null>(null);
  const [i, setI] = useState<number | null>(null);
  const [date, setDate] = useState(DEMO_TODAY);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = act((ds, actor) => addAssessment(ds, riskId, { likelihood: l, impact: i, assessment_date: date, mitigation_notes: notes }, actor));
    if (!r.ok) return setErrors(r.errors);
    toast.push('Assessment saved (demo)');
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {errors._form && <p role="alert" className="text-[var(--sev-critical)]">{errors._form}</p>}
      <ScorePicker likelihood={l} impact={i} onL={setL} onI={setI} errors={errors} />
      <Field label="Assessment date" required error={errors.assessment_date}>
        {(p) => <Input {...p} type="date" max={DEMO_TODAY} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <Field label="Mitigation notes">
        {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary">Save assessment</Button>
      </div>
    </form>
  );
}
