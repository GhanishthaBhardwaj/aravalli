import type { Severity } from '../../domain/types';
import { SEV_BADGE, SEV_COLOR } from '../ui/Chip';

/** Severity badge that leads with the score: "20 Critical". */
export function ScoreBadge({ score, band }: { score: number | null; band: Severity | null }) {
  if (score === null || band === null) return <span className="text-[13px] text-muted">Not assessed</span>;
  const t = SEV_BADGE[band];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: t.bg, color: t.fg }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: SEV_COLOR[band] }} />
      <span className="font-semibold tabular-nums">{score}</span>
      {band}
    </span>
  );
}
