import type { Employee } from '@aravalli/shared';

type Person = Pick<Employee, 'first_name' | 'last_name'>;

/** Initials in a neutral circle. Colour is reserved for risk, so avatars stay grey. */
export function Avatar({ person, size = 28 }: { person: Person; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-medium text-muted"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {person.first_name[0]}{person.last_name[0]}
    </span>
  );
}

export function PersonName({ person }: { person: Employee | undefined }) {
  if (!person) return <span className="text-subtle">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar person={person} size={24} />
      {person.first_name} {person.last_name}
    </span>
  );
}

/** For API rows that carry a display name rather than a whole employee record. */
export function NameChip({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-subtle">Unassigned</span>;
  const [first, ...rest] = name.trim().split(/\s+/);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar person={{ first_name: first, last_name: rest.at(-1) ?? '' }} size={24} />
      {name}
    </span>
  );
}
