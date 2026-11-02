import type { Employee } from '@aravalli/shared';
import { Select } from '../ui/fields';

interface Props {
  id?: string;
  employees: Employee[];
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
}

export function AssigneeSelect({ id, employees, value, onChange, invalid }: Props) {
  return (
    <Select
      id={id}
      aria-invalid={invalid}
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      placeholder="Unassigned"
      options={employees
        .filter((e) => e.is_active)
        .map((e) => ({ value: String(e.employee_id), label: `${e.first_name} ${e.last_name} — ${e.job_title}` }))}
    />
  );
}
