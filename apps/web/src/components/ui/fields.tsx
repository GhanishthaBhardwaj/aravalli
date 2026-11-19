import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (p: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label + control + inline message. The message sits in an aria-live region, so errors are announced. */
export function Field({ label, error, hint, required, className = '', children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium">
        {label}
        {required && <span className="font-normal text-subtle"> (required)</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error || hint ? msgId : undefined })}
      <div id={msgId} aria-live="polite" className="min-h-[22px] pt-1 text-[13px]">
        {error ? <span className="font-medium text-[color:var(--sev-critical-text)]">{error}</span> : hint ? <span className="text-muted">{hint}</span> : null}
      </div>
    </div>
  );
}

export const Input = ({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`control ${className}`} />;
export const Textarea = ({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={4} {...p} className={`control ${className}`} />
);

interface Opt { value: string; label: string }
export function Select({ options, placeholder, className = '', ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: Opt[]; placeholder?: string }) {
  return (
    <select {...p} className={`control ${className}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
