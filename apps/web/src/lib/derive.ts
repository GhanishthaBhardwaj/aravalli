// Small pure helpers for presenting what the API returns. No data fetching and no business rules live here:
// scores, bands, lifecycles and permissions are decided by the server (and by packages/shared).
import type { IncidentListItem } from '@aravalli/shared';

const MS_HOUR = 3_600_000;
const MS_DAY = 24 * MS_HOUR;

/** 'YYYY-MM-DDTHH:mm:ss' (no zone) as milliseconds, treating it as UTC so differences are exact. */
export const toMs = (s: string) => Date.parse(s.length === 10 ? s : `${s.slice(0, 19)}Z`);

export const fullName = (e: { first_name: string; last_name: string } | undefined | null) => (e ? `${e.first_name} ${e.last_name}` : '—');

export const OPEN_INCIDENT_STATUSES = ['Open', 'Investigating', 'Contained'];

/** Age in whole days: occurrence to resolution, or to `nowText` ('YYYY-MM-DDTHH:mm') while still open. */
export function incidentAgeDays(i: Pick<IncidentListItem, 'status' | 'occurred_at' | 'resolved_at'>, nowText: string): number {
  const end = i.resolved_at && !OPEN_INCIDENT_STATUSES.includes(i.status) ? toMs(i.resolved_at) : toMs(`${nowText}:00`);
  return Math.max(0, Math.floor((end - toMs(i.occurred_at)) / MS_DAY));
}

export const formatHours = (h: number | null) => {
  if (h === null) return '—';
  return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
};

/** First and last initial from a single display name ("Ananya Reddy" -> AR). */
export function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/);
  return { first_name: parts[0] ?? '?', last_name: parts.length > 1 ? parts[parts.length - 1] : '' };
}
