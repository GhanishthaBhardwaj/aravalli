import type { Employee, IncidentUpdate } from '../../domain/types';
import { StatusChip } from '../ui/Chip';
import { fmtDateTime } from '../../app/format';
import { PersonName } from '../ui/Avatar';

/** Append-only log, newest first. */
export function UpdateTimeline({ updates, employees }: { updates: IncidentUpdate[]; employees: Employee[] }) {
  return (
    <ol className="relative ml-2 border-l border-line">
      {updates.map((u) => (
        <li key={u.update_id} className="relative pb-5 pl-5 last:pb-0">
          <span aria-hidden="true" className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-[#98a2b3]" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-semibold"><PersonName person={employees.find((e) => e.employee_id === u.updated_by)} /></span>
            <time className="mono text-xs text-muted" dateTime={u.created_at}>{fmtDateTime(u.created_at)}</time>
            {u.status_to && (
              <span className="flex items-center gap-1.5">
                {u.status_from ? <StatusChip status={u.status_from} /> : <span className="text-xs text-muted">New</span>}
                <span aria-label="to">→</span>
                <StatusChip status={u.status_to} />
              </span>
            )}
          </div>
          <p className="mt-1">{u.update_text}</p>
        </li>
      ))}
    </ol>
  );
}
