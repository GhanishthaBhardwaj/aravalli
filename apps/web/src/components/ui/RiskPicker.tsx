import { useMemo } from 'react';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { SearchableSelect } from './SearchableSelect';

interface Props {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
}

/** The risk register is small (tens of rows), so it is loaded once and filtered in the browser. */
export function RiskPicker({ id, value, onChange, invalid, disabled }: Props) {
  const { data } = useApi((signal) => api.risks({ limit: 100, sort: 'code', order: 'asc' }, signal), []);
  const options = useMemo(() => (data?.data ?? []).map((r) => ({ value: String(r.risk_id), label: r.title, hint: r.risk_code })), [data]);
  return <SearchableSelect id={id} options={options} value={value} onChange={onChange} placeholder="No linked risk" invalid={invalid} disabled={disabled} />;
}
