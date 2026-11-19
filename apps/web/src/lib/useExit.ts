import { useEffect, useState } from 'react';

/**
 * Keeps something on screen for a moment after it is told to close, so it can fade out.
 * `mounted` says whether to render it; `closing` says it is on its way out (use it to pick the closing animation).
 */
export function useExit(open: boolean, ms = 150): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open };
}
