import { useId } from 'react';

interface Props {
  legend: string;
  labels: string[]; // one per value, 1..n
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string;
  clearable?: boolean;
}

/** Native radios, so arrow keys and screen readers work for free. */
export function SegmentedControl({ legend, labels, value, onChange, error, clearable }: Props) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-center justify-between text-[14px] font-medium">
        <span>{legend}</span>
        {clearable && value !== null && (
          <button type="button" className="text-[13px] font-normal text-muted underline underline-offset-2 hover:text-fg" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </legend>
      <div className="grid grid-cols-5 gap-1.5">
        {labels.map((label, i) => {
          const v = i + 1;
          const on = value === v;
          return (
            <label
              key={v}
              className={`cursor-pointer rounded-lg border px-1 py-2 text-center transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${
                on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong bg-surface hover:bg-surface-2'
              }`}
            >
              <input type="radio" className="sr-only" name={name} checked={on} onChange={() => onChange(v)} />
              <span className="num block text-[17px] font-semibold leading-6">{v}</span>
              <span className="block text-[11.5px] leading-tight">{label}</span>
            </label>
          );
        })}
      </div>
      <div aria-live="polite" className="min-h-[22px] pt-1 text-[13px] font-medium">{error}</div>
    </fieldset>
  );
}
