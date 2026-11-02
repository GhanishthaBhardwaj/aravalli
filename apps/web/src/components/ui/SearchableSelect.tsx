import { useEffect, useId, useMemo, useState } from 'react';

export interface Opt { value: string; label: string; hint?: string }

interface Props {
  id?: string;
  options: Opt[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/** Type to filter, arrow keys to move, Enter to choose. */
export function SearchableSelect({ id, options, value, onChange, placeholder = 'Search…', invalid, disabled }: Props) {
  const lid = useId();
  const sel = options.find((o) => o.value === value);
  const [q, setQ] = useState(sel?.label ?? '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => setQ(sel?.label ?? ''), [sel?.label]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (!t || q === sel?.label ? options : options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(t))).slice(0, 50);
  }, [q, options, sel?.label]);

  const pick = (o: Opt | null) => {
    onChange(o?.value ?? null);
    setQ(o?.label ?? '');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={lid}
        aria-autocomplete="list"
        aria-invalid={invalid}
        disabled={disabled}
        className="control"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
          if (!e.target.value) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, shown.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && open && shown[hi]) { e.preventDefault(); pick(shown[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul id={lid} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-pop">
          {shown.length === 0 && <li className="px-3 py-2 text-[14px] text-muted">No matches</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              className={`cursor-pointer px-3 py-2 ${i === hi ? 'bg-surface-2' : ''}`}
            >
              <span className="block truncate text-[14px]">{o.label}</span>
              {o.hint && <span className="num block text-[12px] text-subtle">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
