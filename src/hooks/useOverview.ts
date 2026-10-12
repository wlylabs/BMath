import { useEffect } from 'react';
import { getOverview, type Overview } from '../api/bordrless';
import { usePersistentState } from './usePersistentState';

/** SOL's price until the first live read lands; only used for dollar figures and a modelled curve. */
export const FALLBACK_SOL_USD = 150;

const INITIAL: { data: Overview | null; at: number } = { data: null, at: 0 };
let inflight: Promise<void> | null = null;

/**
 * SOL's price and the platform totals from bordrless.app, shared by every component and saved
 * on the device, refreshed when older than five minutes.
 */
export function useOverview() {
  const [state, setState] = usePersistentState('overview', INITIAL);
  useEffect(() => {
    if (Date.now() - state.at < 5 * 60_000 || inflight) return;
    inflight = getOverview()
      .then((data) => setState({ data, at: Date.now() }))
      .catch(() => {})
      .finally(() => {
        inflight = null;
      });
  }, [state.at, setState]);
  return { overview: state.data, solUsd: state.data?.solUsd ?? FALLBACK_SOL_USD, live: state.data !== null };
}
