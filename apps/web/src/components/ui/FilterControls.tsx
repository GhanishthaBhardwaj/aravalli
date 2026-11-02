import { useId } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';

export function FilterSearch({ label, value, onChange, placeholder = 'Code or title' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="min-w-[220px] flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-muted">{label}</label>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-[12px] h-4 w-4 text-subtle" aria-hidden="true" />
        <input id={id} className="control pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, all = 'All' }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; all?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-[150px]">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-muted">{label}</label>
      <select id={id} className="control" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
