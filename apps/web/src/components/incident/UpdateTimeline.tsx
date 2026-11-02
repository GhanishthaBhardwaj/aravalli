import { ArrowRightIcon } from '@heroicons/react/16/solid';
import type { IncidentUpdate } from '@aravalli/shared';
import { StatusBadge } from '../ui/Badge';
import { NameChip } from '../ui/Avatar';
import { fmtDateTime } from '../../app/format';

/** Append-only log, newest first. */
export function UpdateTimeline({ updates }: { updates: (IncidentUpdate & { updated_by_name: string })[] }) {
  return (
    <ol className="relative ml-3 border-l border-line-strong">
      {updates.map((u) => (
        <li key={u.update_id} className="relative pb-7 pl-6 last:pb-0">
          <span aria-hidden="true" className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-fg" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px]">
            <span className="font-medium"><NameChip name={u.updated_by_name} /></span>
            <time className="text-[13px] text-subtle" dateTime={u.created_at}>{fmtDateTime(u.created_at)}</time>
            {u.status_to && (
              <span className="flex items-center gap-2">
                {u.status_from ? <StatusBadge status={u.status_from} /> : <span className="text-[13px] text-subtle">New</span>}
                <ArrowRightIcon className="h-3.5 w-3.5 text-subtle" aria-label="to" />
                <StatusBadge status={u.status_to} />
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[15px] leading-6">{u.update_text}</p>
        </li>
      ))}
    </ol>
  );
}
