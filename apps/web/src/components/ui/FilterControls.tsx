import { useId } from 'react';
import { Search } from 'lucide-react';

export function FilterSearch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="min-w-[200px] flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#344054]">{label}</label>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-[11px] text-muted" aria-hidden="true" />
        <input id={id} className="field-input pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Code or title" />
      </div>
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, all = 'All' }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; all?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-[140px]">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#344054]">{label}</label>
      <select id={id} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
