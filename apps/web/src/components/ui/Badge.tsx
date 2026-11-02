import type { IncidentStatus, RiskStatus, Severity } from '@aravalli/shared';

const base = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[13px] font-medium leading-5';

export const BAND_CLASS: Record<Severity, string> = {
  Low: 'band-low',
  Medium: 'band-medium',
  High: 'band-high',
  Critical: 'band-critical',
};

/** The solid colour of a band, for charts and cells. */
export const BAND_VAR: Record<Severity, string> = {
  Low: 'var(--band-low-bg)',
  Medium: 'var(--band-medium-bg)',
  High: 'var(--band-high-bg)',
  Critical: 'var(--band-critical-bg)',
};
export const BAND_TEXT_VAR: Record<Severity, string> = {
  Low: 'var(--band-low-fg)',
  Medium: 'var(--band-medium-fg)',
  High: 'var(--band-high-fg)',
  Critical: 'var(--band-critical-fg)',
};

/** Neutral outlined badge: used for statuses and anything that is information, not risk. */
export function Badge({ children, tone = 'outline' }: { children: React.ReactNode; tone?: 'outline' | 'solid' }) {
  return (
    <span className={`${base} ${tone === 'solid' ? 'bg-fg text-bg' : 'border border-line-strong text-fg'}`}>{children}</span>
  );
}

/** A risk band always shows its name, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`${base} ${BAND_CLASS[severity]}`}>{severity}</span>;
}

/** Statuses are plain outlined text; Closed is filled to read as finished. */
export function StatusBadge({ status }: { status: RiskStatus | IncidentStatus }) {
  return <Badge tone={status === 'Closed' ? 'solid' : 'outline'}>{status}</Badge>;
}
