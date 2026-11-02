import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | Error | null;
  /** True until the first result (or error) arrives. */
  loading: boolean;
  /** True while a newer request is running and the old data is still on screen. */
  refreshing: boolean;
  reload: () => void;
  setData: (next: T) => void;
}

/**
 * Loads data when the page opens and again whenever `deps` change. A slow, outdated answer can never overwrite a
 * newer one: each run has its own AbortController and the previous one is cancelled.
 */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hasData = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    loadRef.current(controller.signal).then(
      (value) => {
        hasData.current = true;
        setData(value);
        setLoading(false);
        setRefreshing(false);
      },
      (e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
        setRefreshing(false);
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const set = useCallback((next: T) => {
    hasData.current = true;
    setData(next);
  }, []);
  return { data, error, loading, refreshing, reload, setData: set };
}

/** A short, human message for an error state. */
export const errorMessage = (e: Error | null): string | undefined => (e ? e.message : undefined);
export const isNotFound = (e: Error | null): boolean => e instanceof ApiError && e.status === 404;
