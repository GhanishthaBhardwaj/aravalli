import { motion } from 'motion/react';
import { bandFor, IMPACT_LABELS, LIKELIHOOD_LABELS } from '@aravalli/shared';
import type { HeatCell } from '../../data/selectors';
import { BAND_CLASS } from '../ui/Badge';
import { reducedMotion } from '../ui/CountUp';

interface Props {
  cells: HeatCell[];
  onSelect?: (c: HeatCell) => void;
  selected?: { likelihood: number; impact: number } | null;
  /** Cells appear in a diagonal wave, once. */
  reveal?: boolean;
}

/** 5×5 grid. Cell tone = risk band of its position (light grey, grey, dark, orange); the number is how many risks sit there. */
export function HeatMap({ cells, onSelect, selected, reveal }: Props) {
  const wave = reveal && !reducedMotion();
  const size = 'h-[3.6rem] w-[3.6rem] sm:h-[4.4rem] sm:w-[4.4rem]';
  return (
    <div className="inline-block max-w-full">
      <div className="flex gap-2">
        <div className="flex flex-col gap-1.5">
          {[5, 4, 3, 2, 1].map((l) => (
            <div key={l} className="flex h-[3.6rem] items-center justify-end gap-2 sm:h-[4.4rem]">
              <span className="hidden text-[13px] text-muted sm:block">{LIKELIHOOD_LABELS[l - 1]}</span>
              <span className="num w-3 text-right text-[13px] font-medium">{l}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="grid grid-cols-5 gap-1.5">
            {[5, 4, 3, 2, 1].flatMap((l) =>
              [1, 2, 3, 4, 5].map((i) => {
                const c = cells[(l - 1) * 5 + (i - 1)];
                const band = bandFor(l * i);
                const n = c.rows.length;
                const on = selected?.likelihood === l && selected?.impact === i;
                return (
                  <motion.button
                    key={`${l}-${i}`}
                    type="button"
                    disabled={!onSelect}
                    onClick={() => onSelect?.(c)}
                    aria-pressed={onSelect ? on : undefined}
                    aria-label={`Likelihood ${l}, impact ${i}, ${band}, ${n} ${n === 1 ? 'risk' : 'risks'}`}
                    className={`flex items-center justify-center rounded-lg ${BAND_CLASS[band]} ${size} ${onSelect ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
                    style={{ outline: on ? '3px solid var(--fg)' : 'none', outlineOffset: 2 }}
                    initial={wave ? { opacity: 0, scale: 0.6 } : false}
                    animate={{ opacity: n ? 1 : 0.28, scale: 1 }}
                    transition={{ duration: 0.3, delay: wave ? (l - 1 + (i - 1)) * 0.045 : 0, ease: [0.2, 0.7, 0.2, 1] }}
                  >
                    {n > 0 && <span className="num text-[24px] font-semibold leading-none">{n}</span>}
                  </motion.button>
                );
              }),
            )}
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1.5 text-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="leading-tight">
                <span className="num text-[13px] font-medium">{i}</span>
                <span className="hidden text-[12px] text-muted sm:block">{IMPACT_LABELS[i - 1]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 pl-1 text-[13px] text-subtle">Likelihood runs up, impact runs right.</p>
    </div>
  );
}
