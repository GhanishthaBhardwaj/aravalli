import type { IncidentStatus, RiskStatus, Severity } from '@aravalli/shared';

// Solid colours for heat-map cells, bars and dots.
export const SEV_COLOR: Record<Severity, string> = {
  Critical: '#d92d20',
  High: '#ef6820',
  Medium: '#fdb022',
  Low: '#079455',
};
export const SEV_TEXT: Record<Severity, string> = {
  Critical: '#ffffff',
  High: '#ffffff',
  Medium: '#101828',
  Low: '#ffffff',
};
// Tinted badge colours (background, text) for chips.
export const SEV_BADGE: Record<Severity, { bg: string; fg: string }> = {
  Critical: { bg: '#fee4e2', fg: '#b42318' },
  High: { bg: '#ffead5', fg: '#b93815' },
  Medium: { bg: '#fef0c7', fg: '#b54708' },
  Low: { bg: '#d1fadf', fg: '#027a48' },
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  Identified: { bg: '#f2f4f7', fg: '#344054' },
  Assessed: { bg: '#eff8ff', fg: '#175cd3' },
  Mitigating: { bg: '#f4f3ff', fg: '#5925dc' },
  Monitoring: { bg: '#e0f2fe', fg: '#026aa2' },
  Closed: { bg: '#eaecf0', fg: '#1d2939' },
  Open: { bg: '#f2f4f7', fg: '#344054' },
  Investigating: { bg: '#eff8ff', fg: '#175cd3' },
  Contained: { bg: '#f4f3ff', fg: '#5925dc' },
  Resolved: { bg: '#ecfdf3', fg: '#027a48' },
};

const badge = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium';

export function SeverityChip({ severity }: { severity: Severity }) {
  const t = SEV_BADGE[severity];
  return (
    <span className={badge} style={{ background: t.bg, color: t.fg }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR[severity] }} />
      {severity}
    </span>
  );
}

export function StatusChip({ status }: { status: RiskStatus | IncidentStatus }) {
  const t = STATUS_BADGE[status];
  return (
    <span className={badge} style={{ background: t.bg, color: t.fg }}>
      {status}
    </span>
  );
}
