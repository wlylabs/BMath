'use client';

import { compactUsd, num, pct, shortAddress } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { ROUTES } from '../lib/routes';
import { bordrlessTokenUrl, OUR_TOKEN } from '../lib/site';
import { curveParams, graduationMcapSol } from '../lib/bordrless';
import { useLaunch } from '../hooks/useLaunch';
import { usePersistentState } from '../hooks/usePersistentState';
import type { Launch } from '../api/bordrless';
import { Logo } from './Logo';
import { NavLink } from './NavLink';
import { PixelIcon, type PixelIconName } from './PixelIcon';

/** Below this many holders the card invites the first ones instead of showing a small count. */
const EARLY_HOLDERS = 10;

/**
 * BMath's own token, live from bordrless.app. Laid out to be acted on: what a holder gets comes
 * first, then who already holds and how far the curve is from graduating, then one clear buy
 * button. Every figure is live and every claim is a rule fixed on chain.
 */
export function OurToken() {
  const { launch, failed } = useLaunch(OUR_TOKEN.mint);
  // the fee calculator's saved token, so its button opens the calculator on this one
  const [, setFeeToken] = usePersistentState<Launch | null>('fee-token', null);

  const holders = launch?.holders ?? 0;
  const early = launch !== null && holders < EARLY_HOLDERS;
  const holderShare = launch ? (launch.rules.holderFeeBuyBps + launch.rules.holderFeeSellBps) / 2 / 10_000 + (launch.companion ? (launch.rules.creatorFeeBps / 10_000) * launch.companion.holders : 0) : 0;
  const burnShare = launch ? (launch.rules.burnBuyBps + launch.rules.burnSellBps) / 2 / 10_000 : 0;

  const solLeft = launch?.reserves && launch.graduationQuote ? Math.max(0, (Number(launch.graduationQuote) - Number(launch.reserves.quoteReserve)) / 1e9) : null;
  const usdPerSol = launch?.mcapUsd && launch.mcapSol ? launch.mcapUsd / launch.mcapSol : null;
  const gradMcapUsd = launch?.reserves && Number(launch.reserves.virtualQuote) > 0 && usdPerSol ? graduationMcapSol(curveParams(BigInt(launch.reserves.virtualQuote))) * usdPerSol : null;
  const progress = launch ? Math.min(1, Math.max(0, launch.progress)) : 0;

  const perks: { icon: PixelIconName; text: string }[] = launch
    ? [
        ...(holderShare > 0 ? [{ icon: 'earn' as const, text: t.ours.perkHolders(pct(holderShare, { digits: 0 })) }] : []),
        ...(burnShare > 0 ? [{ icon: 'fee' as const, text: t.ours.perkBurn(pct(burnShare, { digits: 1 })) }] : []),
        { icon: 'home', text: t.ours.perkFair },
      ]
    : [];

  return (
    <section aria-labelledby="ours-title" aria-busy={!launch && !failed} className="mx-auto max-w-[1360px] px-4 pb-4 sm:px-6">
      <div className="card overflow-hidden !border-ink">
        {/* the benefit, first and largest */}
        <div className="border-b-2 border-ink bg-sun px-4 py-4 text-[#151515] sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="tag">{t.ours.tag}</span>
            {launch && (
              <span className="label inline-flex items-center gap-1.5 rounded-sm border border-[#151515] bg-[#f4f4f2] px-1.5 py-0.5 text-[#151515]">
                <span aria-hidden className="blink size-2 bg-green" />
                {t.common.live}
              </span>
            )}
          </div>
          <p className="display mt-3 text-[2.6rem] leading-[0.95] sm:text-6xl">{t.ours.headline}</p>
          <p className="mt-2 max-w-2xl text-[15px] leading-snug sm:text-base">{t.ours.subhead}</p>
        </div>

        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* who it is and what holding it does */}
          <div>
            <div className="flex items-center gap-3.5">
              <span className="shrink-0 border-2 border-ink shadow-[3px_3px_0_0_var(--cast)]">
                <Logo className="block size-16 sm:size-20" />
              </span>
              <div className="min-w-0">
                <h2 id="ours-title" className="display text-3xl text-ink sm:text-4xl">
                  {OUR_TOKEN.name}
                </h2>
                <p className="label mt-1 text-ink-2">
                  <span className="font-semibold text-ink">${OUR_TOKEN.symbol}</span> · {shortAddress(OUR_TOKEN.mint)}
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2">
              {perks.map((p) => (
                <li key={p.text} className="flex items-center gap-3 rounded border border-line bg-surface-2 px-3 py-2.5 text-[15px] font-semibold text-ink">
                  <span className="flex size-8 shrink-0 items-center justify-center border border-ink bg-sun text-[#151515]">
                    <PixelIcon name={p.icon} className="size-4" />
                  </span>
                  {p.text}
                </li>
              ))}
              {!launch &&
                [0, 1, 2].map((i) => <li key={i} aria-hidden className={cx('h-[50px] rounded border border-line', !failed && 'animate-pulse bg-line/50')} />)}
            </ul>
          </div>

          {/* proof that it is moving, and how far it has to go */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded border-2 border-ink bg-surface px-4 py-3">
                <p className="label text-muted">{t.ours.holders}</p>
                {launch ? (
                  early ? (
                    <>
                      <p className="display mt-1 text-3xl text-ink">{t.ours.beFirst}</p>
                      <p className="label mt-1 text-ink-2">{holders > 0 ? t.ours.holdersSoFar(num(holders, 0)) : t.ours.justOpened}</p>
                    </>
                  ) : (
                    <p className="num mt-1 text-4xl font-semibold text-ink">{num(holders, 0)}</p>
                  )
                ) : (
                  <span aria-hidden className={cx('mt-2 block h-9 w-24', !failed && 'animate-pulse bg-line')} />
                )}
              </div>
              <div className="rounded border border-line bg-surface-2 px-3 py-3">
                <p className="label text-muted">{t.ours.mcap}</p>
                <p className="num mt-1 text-2xl font-semibold text-ink">{launch ? compactUsd(launch.mcapUsd) : '–'}</p>
              </div>
              <div className="rounded border border-line bg-surface-2 px-3 py-3">
                <p className="label text-muted">{launch?.rewardsSol ? t.ours.paid : t.ours.volume}</p>
                <p className="num mt-1 text-2xl font-semibold text-ink">
                  {launch ? (launch.rewardsSol ? `${num(launch.rewardsSol, 3)} SOL` : compactUsd(launch.volume24hUsd ?? 0)) : '–'}
                </p>
              </div>
            </div>

            {launch && launch.status === 'curve' && (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-semibold text-ink">{solLeft !== null ? t.ours.toGraduate(num(solLeft, 1)) : t.ours.onCurve}</p>
                  <p className="num text-sm font-semibold text-ink">{pct(progress, { digits: 1 })}</p>
                </div>
                <div className="relative mt-2 h-5 border-2 border-ink bg-surface" aria-hidden>
                  <div className="h-full bg-green" style={{ width: `${Math.max(2, progress * 100)}%` }} />
                  {/* quarter marks make a long road look like steps */}
                  {[25, 50, 75].map((m) => (
                    <span key={m} className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${m}%` }} />
                  ))}
                </div>
                <p className="label mt-1.5 text-muted">
                  {gradMcapUsd ? t.ours.graduatesAt(compactUsd(gradMcapUsd)) : null}
                </p>
              </div>
            )}
            {launch?.status === 'graduated' && <p className="text-[15px] font-semibold text-ink">{t.ours.graduated}</p>}
            {failed && (
              <p className="label text-muted" role="status">
                {t.ours.unavailable}
              </p>
            )}
            {!launch && !failed && <p className="sr-only" role="status">{t.ours.loading}</p>}
          </div>
        </div>

        {/* one clear action, one quieter one */}
        <div className="flex flex-col gap-3 border-t-2 border-ink bg-surface-2 p-4 sm:flex-row sm:items-center sm:p-6">
          <a
            href={bordrlessTokenUrl(OUR_TOKEN.mint)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sun h-14 px-6 text-lg sm:min-w-72"
          >
            {t.ours.buy(OUR_TOKEN.symbol)}
            <PixelIcon name="arrow" className="size-5" />
          </a>
          <NavLink href={ROUTES.fee} onClick={() => launch && setFeeToken(launch)} className="btn h-14 px-5">
            {t.ours.tryIt}
          </NavLink>
          {launch && (
            <p className="label text-muted sm:ml-auto sm:text-right">
              {t.ours.fees(pct(Math.max(launch.buyFeeBps, launch.sellFeeBps) / 10_000))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
