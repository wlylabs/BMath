import { useEffect, useState } from 'react';
import { getLaunch, type Launch } from '../api/bordrless';

/** One launch from bordrless.app, refreshed every minute while the page is visible. */
export function useLaunch(mint: string) {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const load = () =>
      getLaunch(mint, ctrl.signal)
        .then((l) => {
          setLaunch(l);
          setFailed(l === null);
        })
        .catch((e: unknown) => {
          if ((e as Error).name !== 'AbortError') setFailed(true);
        });
    const first = setTimeout(load, 0);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      ctrl.abort();
      clearTimeout(first);
      clearInterval(id);
    };
  }, [mint]);

  return { launch, failed };
}
