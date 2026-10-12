'use client';

import { compactUsd, num, pct, shortAddress } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { ROUTES } from '../lib/routes';
import { bordrlessTokenUrl, OUR_TOKEN } from '../lib/site';
import { useLaunch } from '../hooks/useLaunch';
import { usePersistentState } from '../hooks/usePersistentState';
import type { Launch } from '../api/bordrless';
import { Logo } from './Logo';
import { NavLink } from './NavLink';
import { PixelIcon } from './PixelIcon';
import { rulesSummary } from './TokenLookup';
import { LiveBadge } from './ui';

/** BMath's own token, live from bordrless.app. */
export function OurToken() {
  const { launch, failed } = useLaunch(OUR_TOKEN.mint);
  // the fee calculator's saved token, so its button opens the calculator on this one
  const [, setFeeToken] = usePersistentState<Launch | null>('fee-token', null);
  const fee = launch
    ? launch.buyFeeBps === launch.sellFeeBps
      ? pct(launch.buyFeeBps / 10_000)
      : `${pct(launch.buyFeeBps / 10_000)} / ${pct(launch.sellFeeBps / 10_000)}`
    : null;
  const stats = [
    { label: t.ours.mcap, value: launch ? compactUsd(launch.mcapUsd) : null },
    { label: t.ours.holders, value: launch ? num(launch.holders, 0) : null },
    { label: t.ours.volume, value: launch ? compactUsd(launch.volume24hUsd ?? 0) : null },
    { label: t.ours.fees, value: fee },
  ];

  return (
    <section aria-labelledby="ours-title" aria-busy={!launch && !failed} className="mx-auto max-w-[1360px] px-4 pb-4 sm:px-6">
      <div className="card overflow-hidden">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="shrink-0 border-2 border-ink shadow-[3px_3px_0_0_var(--cast)]">
              <Logo className="block size-20 sm:size-24" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="tag">{t.ours.tag}</span>
                {launch && <LiveBadge label={t.common.live} />}
              </p>
              <h2 id="ours-title" className="display mt-2 text-4xl text-ink sm:text-5xl">
                {OUR_TOKEN.name}
              </h2>
              <p className="label mt-1 text-ink-2">
                <span className="font-semibold text-ink">${OUR_TOKEN.symbol}</span> · {shortAddress(OUR_TOKEN.mint)}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">{t.ours.lead}</p>
            </div>
          </div>

          <div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded border border-line bg-surface-2 px-3 py-2.5">
                  <dt className="label text-muted">{s.label}</dt>
                  <dd className="num mt-1 text-xl font-semibold text-ink">
                    {s.value ?? (
                      <span aria-hidden className={cx('inline-block h-6 w-14 align-middle', !failed && 'animate-pulse bg-line')}>
                        {failed ? '–' : ''}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {launch && (
              <>
                <div className="mt-3">
                  <div className="h-2.5 border border-ink bg-surface" aria-hidden>
                    <div className="h-full bg-green" style={{ width: `${Math.min(100, Math.max(1, launch.progress * 100))}%` }} />
                  </div>
                  <p className="label mt-1 text-muted">
                    {launch.status === 'graduated' ? t.ours.graduated : t.ours.progress(pct(launch.progress, { digits: 1 }))}
                  </p>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {rulesSummary(launch).map((r) => (
                    <li key={r} className="label border border-line-strong bg-surface px-1.5 py-1 text-ink-2">
                      {r}
                    </li>
                  ))}
                  {launch.companion && launch.companion.holders > 0 && (
                    <li className="label border border-line-strong bg-surface px-1.5 py-1 text-ink-2">
                      {t.ours.companion(pct(launch.companion.holders, { digits: 0 }))}
                    </li>
                  )}
                </ul>
              </>
            )}
            {failed && <p className="label mt-2 text-muted" role="status">{t.ours.unavailable}</p>}
            {!launch && !failed && <p className="sr-only" role="status">{t.ours.loading}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-ink bg-surface-2 p-4 sm:flex-row sm:p-5">
          <a href={bordrlessTokenUrl(OUR_TOKEN.mint)} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-11">
            {t.ours.trade}
            <PixelIcon name="external" className="size-3.5" />
          </a>
          <NavLink href={ROUTES.fee} onClick={() => launch && setFeeToken(launch)} className="btn h-11">
            {t.ours.tryIt}
            <PixelIcon name="arrow" className="size-4" />
          </NavLink>
        </div>
      </div>
    </section>
  );
}
