'use client';

import type { CSSProperties } from 'react';
import {
  LAUNCH_PROTOCOL_SHARE_BPS,
  LP_FEE_BPS,
  presetRules,
  quoteTrade,
  reservesAtMcap,
  curveParams,
  SNIPER_START_BPS,
  virtualQuoteForSolPrice,
} from '../lib/bordrless';
import { num, pct } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { ROUTES } from '../lib/routes';
import { NavLink } from './NavLink';
import { PixelIcon } from './PixelIcon';

/** Stagger slot for the first-load entrance (.rise, .grow-x in globals.css). */
const at = (i: number) => ({ '--i': i }) as CSSProperties;

// the worked example: 1 SOL into a Diamond hands launch at a $20k market cap, SOL at $150
const EXAMPLE = (() => {
  const curve = curveParams(virtualQuoteForSolPrice(150));
  return quoteTrade({ side: 'buy', amount: 1, rules: presetRules('diamond-hands'), reserves: reservesAtMcap(20_000 / 150, curve) });
})();

export function Hero() {
  const e = EXAMPLE;
  const intoCurve = e.amountIn - e.creatorFee - e.holderFee - e.protocolFee - e.lpFee;
  const parts = [
    { label: t.hero.receiptCreator, value: e.creatorFee, bar: 'bg-orange' },
    { label: t.hero.receiptHolders, value: e.holderFee, bar: 'bg-teal' },
    { label: t.hero.receiptShare, value: e.protocolFee, bar: 'bg-spot' },
    { label: t.hero.receiptLp, value: e.lpFee, bar: 'bg-plum' },
  ];
  const facts = [
    { value: pct(LP_FEE_BPS / 10_000, { digits: 1 }), label: t.facts.lp },
    { value: pct(LAUNCH_PROTOCOL_SHARE_BPS / 10_000, { digits: 0 }), label: t.facts.share },
    { value: pct(SNIPER_START_BPS / 10_000, { digits: 0 }), label: t.facts.sniper, sub: t.facts.sniperSub },
    { value: '9×', label: t.facts.graduation, sub: t.facts.graduationSub },
  ];

  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1360px] gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-14 lg:pb-14 lg:pt-14">
        <div>
          <p className="rise tag" style={at(0)}>
            <PixelIcon name="fee" className="size-3" />
            {t.hero.tag}
            <span aria-hidden className="blink -ml-0.5">
              _
            </span>
          </p>
          <h1 className="rise display mt-5 text-[3.5rem] text-ink sm:text-[5.5rem] lg:text-[6.5rem]" style={at(1)}>
            {t.hero.title1}
            <br />
            {t.hero.title2}
          </h1>
          <p className="rise display mt-3 text-3xl text-ink-2 sm:text-4xl" style={at(2)}>
            {t.hero.sub}
          </p>
          <p className="rise display mt-4 inline-block rounded bg-deep px-3.5 py-2.5 text-[1.9rem] text-on-deep shadow-[4px_4px_0_0_var(--line-strong)] sm:text-[2.5rem]" style={at(3)}>
            {t.hero.highlight}
          </p>
          <p className="rise mt-6 max-w-xl text-lg leading-relaxed text-ink" style={at(4)}>
            {t.hero.lead}
          </p>
          <p className="rise mt-3 max-w-xl border-t border-ink pt-3 text-sm leading-relaxed text-ink-2" style={at(5)}>
            {t.hero.leadSmall}
          </p>
          <div className="rise mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap" style={at(6)}>
            <NavLink href={ROUTES.fee} className="btn btn-ink h-12">
              {t.hero.cta}
              <PixelIcon name="arrow" className="size-4" />
            </NavLink>
            <NavLink href={ROUTES.methodology} className="btn h-12">
              {t.hero.ctaSecondary}
              <PixelIcon name="arrow" className="size-4" />
            </NavLink>
          </div>
          <div className="rise mt-3 flex flex-col gap-3 sm:flex-row" style={at(7)}>
            <NavLink href={ROUTES.profit} className="btn btn-sun h-12">
              <PixelIcon name="profit" className="size-4" />
              {t.hero.ctaProfit}
            </NavLink>
            <NavLink href={ROUTES.earn} className="btn btn-spot h-12">
              <PixelIcon name="earn" className="size-4" />
              {t.hero.ctaEarn}
            </NavLink>
          </div>
        </div>

        <figure className="rise card p-5 sm:p-6" style={at(3)}>
          <figcaption>
            <p className="label flex flex-wrap items-center gap-x-2 gap-y-1.5 text-muted">
              <span className="tag shrink-0 whitespace-nowrap !py-1">{t.hero.receipt}</span>
              {t.hero.receiptSub(t.common.presets['diamond-hands']!)}
            </p>
            <p className="display mt-3 text-4xl text-ink">{t.hero.receiptTitle}</p>
          </figcaption>
          {/* the total fee, split by who takes it */}
          <div className="mt-5 flex h-10 overflow-hidden border-2 border-ink" aria-hidden>
            {parts.map((p, i) => (
              <span
                key={p.label}
                className={cx('grow-x h-full border-ink [&:not(:last-child)]:border-r-2', p.bar)}
                style={{ ...at(i + 4), width: `${(p.value / e.totalFeesSol) * 100}%` }}
              />
            ))}
          </div>
          <dl className="mt-3 divide-y divide-line border-t border-ink">
            {parts.map((p) => (
              <div key={p.label} className="flex items-center justify-between gap-3 py-2.5">
                <dt className="flex items-center gap-2.5 text-[15px] text-ink-2">
                  <span aria-hidden className={cx('size-3 border border-ink', p.bar)} />
                  {p.label}
                </dt>
                <dd className="num text-sm text-ink">
                  {num(p.value, 4)} SOL <span className="text-muted">· {pct(p.value / e.amountIn)}</span>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="flex items-center gap-2.5 text-[15px] text-ink-2">
                <span aria-hidden className="size-3 border border-ink bg-surface-2" />
                {t.hero.receiptCurve}
              </dt>
              <dd className="num text-sm text-ink">{num(intoCurve, 4)} SOL</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <dt className="text-[15px] font-semibold text-ink">{t.hero.receiptTotal}</dt>
              <dd className="num text-lg font-semibold text-ink">{pct(e.feeRate)}</dd>
            </div>
          </dl>
        </figure>
      </div>

      <div className="mx-auto max-w-[1360px] px-4 pb-4 sm:px-6">
        <div className="card p-4 sm:p-5">
          <p className="label text-ink">{t.facts.title}</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="rounded border border-line bg-surface-2 px-3 py-2.5">
                <dt className="label text-muted">{f.label}</dt>
                <dd className="num mt-1 text-2xl font-semibold text-ink">{f.value}</dd>
                {f.sub && <dd className="label text-muted">{f.sub}</dd>}
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
