import type { Employee } from '@aravalli/shared';

type Person = Pick<Employee, 'first_name' | 'last_name'>;

/** Initials from the first word and the last word that is not a number: "Production Supervisor 1" is PS, "Maya Sharma" is MS. */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((w) => w !== '' && !/^\d+$/.test(w));
  if (words.length === 0) return '?';
  return (words[0]![0]! + (words.length > 1 ? words[words.length - 1]![0]! : '')).toUpperCase();
}

/** Initials in a neutral circle. Colour is reserved for risk, so avatars stay grey. */
export function Avatar({ person, size = 28 }: { person: Person; size?: number }) {
  return <Initials text={initialsOf(`${person.first_name} ${person.last_name}`)} size={size} />;
}

function Initials({ text, size }: { text: string; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-medium text-muted"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {text}
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
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Initials text={initialsOf(name)} size={24} />
      {name}
    </span>
  );
}
