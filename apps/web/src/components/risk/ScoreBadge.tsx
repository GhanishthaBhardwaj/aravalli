import type { Severity } from '@aravalli/shared';
import { BAND_CLASS } from '../ui/Badge';

/** The score in the band's tone, with the band named beside it (never colour alone). */
export function ScoreBadge({ score, band }: { score: number | null; band: Severity | null }) {
  if (score === null || band === null) return <span className="text-[14px] text-subtle">Not assessed</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[14px]">
      <span className={`num inline-flex h-7 min-w-[30px] items-center justify-center rounded-md px-1.5 text-[14px] font-semibold ${BAND_CLASS[band]}`}>{score}</span>
      {band}
    </span>
  );
}
