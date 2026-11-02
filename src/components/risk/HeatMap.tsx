import { bandFor, IMPACT_LABELS, LIKELIHOOD_LABELS } from '../../domain/scoring';
import type { HeatCell } from '../../data/selectors';
import { SEV_COLOR, SEV_TEXT } from '../ui/Chip';

interface Props {
  cells: HeatCell[];
  size?: 'sm' | 'lg';
  onSelect?: (c: HeatCell) => void;
  selected?: { likelihood: number; impact: number } | null;
  /** Cells appear in a diagonal wave, once. */
  reveal?: boolean;
}

/** A hazard board: solid signal colours, the number of risks in each cell, empty cells left quiet. */
export function HeatMap({ cells, size = 'lg', onSelect, selected, reveal }: Props) {
  const lg = size === 'lg';
  const cell = lg ? 'h-[4.1rem] w-[4.1rem] sm:h-[4.6rem] sm:w-[4.6rem]' : 'h-11 w-11';
  return (
    <div className="inline-block max-w-full">
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5">
          {[5, 4, 3, 2, 1].map((l) => (
            <div key={l} className={`flex items-center justify-end gap-1.5 text-right ${lg ? 'h-[4.1rem] sm:h-[4.6rem]' : 'h-11'}`}>
              {lg && <span className="hidden text-[12px] leading-tight text-muted sm:block">{LIKELIHOOD_LABELS[l - 1]}</span>}
              <span className="w-3 text-[13px] font-medium text-ink">{l}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="grid grid-cols-5 gap-1">
            {[5, 4, 3, 2, 1].flatMap((l) =>
              [1, 2, 3, 4, 5].map((i) => {
                const c = cells[(l - 1) * 5 + (i - 1)];
                const band = bandFor(l * i);
                const n = c.rows.length;
                const on = selected?.likelihood === l && selected?.impact === i;
                return (
                  <button
                    key={`${l}-${i}`}
                    type="button"
                    disabled={!onSelect}
                    onClick={() => onSelect?.(c)}
                    aria-pressed={onSelect ? on : undefined}
                    aria-label={`Likelihood ${l}, impact ${i}, ${band}, ${n} ${n === 1 ? 'risk' : 'risks'}`}
                    className={`heat-cell flex items-center justify-center rounded-md ${cell} ${reveal ? 'tile-in' : ''} ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                      background: SEV_COLOR[band],
                      color: SEV_TEXT[band],
                      opacity: n ? 1 : 0.38,
                      outline: on ? '3px solid #16181d' : 'none',
                      outlineOffset: 1,
                      animationDelay: reveal ? `${(l - 1 + (i - 1)) * 55}ms` : undefined,
                    }}
                  >
                    {n > 0 && <span className={`display ${lg ? 'text-[24px]' : 'text-xl'} font-semibold leading-none tabular-nums`}>{n}</span>}
                  </button>
                );
              }),
            )}
          </div>
          <div className="mt-1.5 grid grid-cols-5 gap-1 text-center">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="leading-tight">
                <span className="text-[13px] font-medium">{i}</span>
                {lg && <span className="hidden text-[12px] text-muted sm:block">{IMPACT_LABELS[i - 1]}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 pl-[4.5rem] text-[12px] text-muted">
        <span>Likelihood runs up, impact runs right</span>
      </div>
    </div>
  );
}
