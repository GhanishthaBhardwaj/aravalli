import { useId } from 'react';

interface Props {
  legend: string;
  labels: string[]; // one per value, 1..n
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
  clearable?: boolean;
}

/** Native radios, so arrow-key navigation and screen-reader semantics come for free. */
export function SegmentedControl({ legend, labels, value, onChange, error, clearable }: Props) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 flex w-full items-center justify-between text-[13px] font-medium">
        <span>{legend}</span>
        {clearable && value !== null && (
          <button type="button" className="text-xs text-accent underline" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </legend>
      <div className="grid grid-cols-5 gap-1">
        {labels.map((label, i) => {
          const v = i + 1;
          const on = value === v;
          return (
            <label
              key={v}
              className={`cursor-pointer rounded-lg border px-1 py-2 text-center transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${
                on ? 'border-signal bg-signal text-white' : 'border-[#d0d5dd] bg-surface hover:bg-[var(--hover)]'
              }`}
            >
              <input type="radio" className="sr-only" name={name} checked={on} onChange={() => onChange(v)} />
              <span className="block text-[16px] font-semibold leading-6">{v}</span>
              <span className="block text-[11px] leading-tight">{label}</span>
            </label>
          );
        })}
      </div>
      <div aria-live="polite" className="min-h-[18px] pt-1 text-xs text-[var(--sev-critical)]">
        {error}
      </div>
    </fieldset>
  );
}
