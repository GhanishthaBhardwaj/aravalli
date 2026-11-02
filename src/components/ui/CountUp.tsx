import { useEffect, useState } from 'react';

export const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const reduced = reducedMotion;

/** Counts from 0 to `value` once on mount. Shows the final value immediately if motion is reduced. */
export function CountUp({ value, format = (n) => String(Math.round(n)), ms = 800, delay = 0 }: {
  value: number; format?: (n: number) => string; ms?: number; delay?: number;
}) {
  const [n, setN] = useState(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setN(value); return; }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - start) / ms));
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, delay]);
  return <>{format(n)}</>;
}
