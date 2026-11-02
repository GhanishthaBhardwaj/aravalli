import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { fullName } from '../../lib/derive';
import { SearchableSelect, type Opt } from './SearchableSelect';

interface Props {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** Shown for the current value before the person has been loaded. */
  initialLabel?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/** Search-as-you-type over the organisation's active people. The server does the searching, so any headcount works. */
export function PersonPicker({ id, value, onChange, initialLabel, placeholder = 'Unassigned', invalid, disabled }: Props) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Opt[]>([]);
  const chosen = useRef<Opt | null>(value !== null && initialLabel ? { value: String(value), label: initialLabel } : null);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      api.employees({ q: q.trim() || undefined, limit: 20, active: true, sort: 'name' }, controller.signal).then(
        (page) => setFound(page.data.map((e) => ({ value: String(e.employee_id), label: fullName(e), hint: `${e.job_title}, ${e.department_name}` }))),
        () => undefined,
      );
    }, q ? 200 : 0);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q]);

  const options = useMemo(() => {
    const sel = found.find((o) => o.value === String(value));
    if (sel) chosen.current = sel;
    const keep = value !== null && !sel && chosen.current?.value === String(value) ? [chosen.current] : [];
    return [...keep, ...found];
  }, [found, value]);

  return (
    <SearchableSelect
      id={id}
      options={options}
      filter={false}
      onSearch={setQ}
      value={value === null ? null : String(value)}
      onChange={(v) => onChange(v === null ? null : Number(v))}
      placeholder={placeholder}
      invalid={invalid}
      disabled={disabled}
    />
  );
}
