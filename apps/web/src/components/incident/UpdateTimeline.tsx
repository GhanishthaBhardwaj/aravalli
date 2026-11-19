import type { IncidentUpdate } from '@aravalli/shared';
import { fmtDateTime } from '../../app/format';

/** Append-only log, newest first. A status change gets the accent dot; a plain note gets a grey one. */
export function UpdateTimeline({ updates }: { updates: (IncidentUpdate & { updated_by_name: string })[] }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-[18px] border-l border-line-strong p-0 pl-5">
      {updates.map((u) => {
        const title = u.status_to ? (u.status_from ? `Status: ${u.status_to}` : 'Reported') : 'Update';
        return (
          <li key={u.update_id} className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[26px] top-1.5 h-[11px] w-[11px] rounded-full border-2 border-surface"
              style={{ background: u.status_to && u.status_from ? 'var(--accent)' : 'var(--sev-low)' }}
            />
            <div className="flex justify-between gap-2.5">
              <span className="font-semibold">{title}</span>
              <time className="num whitespace-nowrap text-[12px] text-muted" dateTime={u.created_at}>{fmtDateTime(u.created_at)}</time>
            </div>
            <p className="text-[13.5px] leading-snug text-muted">
              <span className="font-medium text-fg">{u.updated_by_name}</span>: {u.update_text}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
