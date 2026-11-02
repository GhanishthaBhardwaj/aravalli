import type { Department, Employee } from '@aravalli/shared';

// One hue per department / person so rows are recognisable at a glance.
const HUES = ['#2563eb', '#0e9384', '#dc6803', '#d92d20', '#7a5af8', '#0ba5ec', '#dd2590', '#4e8a0b'];
export const hue = (id: number) => HUES[(id - 1) % HUES.length];

export function Avatar({ person, size = 28 }: { person: Pick<Employee, 'employee_id' | 'first_name' | 'last_name'>; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: hue(person.employee_id), fontSize: size * 0.4 }}
    >
      {person.first_name[0]}{person.last_name[0]}
    </span>
  );
}

export function PersonName({ person }: { person: Employee | undefined }) {
  if (!person) return <span className="text-muted">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar person={person} size={24} />
      {person.first_name} {person.last_name}
    </span>
  );
}

export function DeptTag({ department }: { department: Department }) {
  const c = hue(department.department_id);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />
      {department.name}
    </span>
  );
}
