import { useEffect, useState } from 'react';
import { getCandles, type Candle } from '../api/bordrless';

/** A launch's candles since it opened; null while loading or without a mint. */
export function useCandles(mint: string | null) {
  const [state, setState] = useState<{ mint: string; candles: Candle[] | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!mint) return;
    const ctrl = new AbortController();
    getCandles(mint, ctrl.signal)
      .then((candles) => setState({ mint, candles, failed: false }))
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setState({ mint, candles: null, failed: true });
      });
    return () => ctrl.abort();
  }, [mint]);

  // a result for another token is not this one's
  const mine = state && state.mint === mint ? state : null;
  return { candles: mine?.candles ?? null, failed: mine?.failed ?? false, loading: !!mint && !mine };
}
