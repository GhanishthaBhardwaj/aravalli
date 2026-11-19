import type { IncidentStatus, RiskStatus, Severity } from '@aravalli/shared';

const base = 'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[13px] font-medium leading-5';
const pill = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold leading-5';

export const BAND_CLASS: Record<Severity, string> = {
  Low: 'band-low',
  Medium: 'band-medium',
  High: 'band-high',
  Critical: 'band-critical',
};

/** The severity colour (the dot), for charts and cells. Never the brand colour. */
export const BAND_VAR: Record<Severity, string> = {
  Low: 'var(--sev-low)',
  Medium: 'var(--sev-medium)',
  High: 'var(--sev-high)',
  Critical: 'var(--sev-critical)',
};
/** Text that sits on a bar or cell filled with the solid severity colour. */
export const BAND_TEXT_VAR: Record<Severity, string> = {
  Low: '#0f1a16',
  Medium: '#0f1a16',
  High: '#0f1a16',
  Critical: '#ffffff',
};
/** The darker text shade of a severity, readable on the page background in both themes. */
export const BAND_LABEL_VAR: Record<Severity, string> = {
  Low: 'var(--sev-low-text)',
  Medium: 'var(--sev-medium-text)',
  High: 'var(--sev-high-text)',
  Critical: 'var(--sev-critical-text)',
};

/** Neutral outlined badge: used for statuses and anything that is information, not risk. */
export function Badge({ children, tone = 'outline' }: { children: React.ReactNode; tone?: 'outline' | 'solid' }) {
  return (
    <span className={`${base} ${tone === 'solid' ? 'bg-track text-fg' : 'border border-line-strong text-fg'}`}>{children}</span>
  );
}

/** A risk band always shows its name, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`${pill} ${BAND_CLASS[severity]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: BAND_VAR[severity] }} />
      {severity}
    </span>
  );
}

/** Statuses are plain outlined text; Closed is filled to read as finished. */
export function StatusBadge({ status }: { status: RiskStatus | IncidentStatus }) {
  return <Badge tone={status === 'Closed' ? 'solid' : 'outline'}>{status}</Badge>;
}
