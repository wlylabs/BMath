import { useCallback, useEffect, useState } from 'react';
import { getOverview, type Overview } from '../api/bordrless';
import { usePersistentState } from './usePersistentState';

/** SOL's price until the first live read lands; only used for dollar figures and a modelled curve. */
export const FALLBACK_SOL_USD = 150;

/** The proxy caches for a minute; asking more often gets the same answer. */
const MAX_AGE = 60_000;

const INITIAL: { data: Overview | null; at: number } = { data: null, at: 0 };
let inflight: Promise<boolean> | null = null;

export type OverviewStatus = 'loading' | 'live' | 'stale' | 'error';

/**
 * SOL's price and the platform totals from bordrless.app, shared by every component and saved on
 * the device. Refreshed when older than a minute and every minute while the page is visible. A
 * failed read keeps the last good numbers (status 'stale') or, with none, reports 'error'.
 */
export function useOverview() {
  const [state, setState] = usePersistentState('overview', INITIAL);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((fromUser = false) => {
    if (!inflight) {
      inflight = getOverview()
        .then((data) => {
          setState({ data, at: Date.now() });
          return true;
        })
        .catch(() => false)
        .finally(() => {
          inflight = null;
        });
    }
    // only a tap shows the spinner; background refreshes stay quiet
    if (fromUser) setBusy(true);
    void inflight.then((ok) => {
      setFailed(!ok);
      setBusy(false);
    });
  }, [setState]);

  useEffect(() => {
    // deferred a tick: the first read lands after hydration, not inside this effect
    const first = setTimeout(() => {
      if (Date.now() - state.at >= MAX_AGE) load();
    }, 0);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, MAX_AGE);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [state.at, load]);

  const status: OverviewStatus = state.data ? (failed ? 'stale' : 'live') : failed ? 'error' : 'loading';
  return {
    overview: state.data,
    solUsd: state.data?.solUsd ?? FALLBACK_SOL_USD,
    live: state.data !== null,
    status,
    updatedAt: state.at,
    busy,
    retry: () => load(true),
  };
}
