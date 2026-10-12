'use client';

import { useId, useRef } from 'react';
import { HALF_LIFE, halfLifeBlend, halfLifeFeePpm, NO_RULES, quoteTrade, spotPrice, TOKEN_SUPPLY, virtualQuoteForSolPrice } from '../../lib/bordrless';
import { modelLaunch, modelPool } from '../../lib/roundtrip';
import { compactUsd, num, parseAmount, pct, usd } from '../../lib/format';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useOverview } from '../../hooks/useOverview';
import { reservesOf, type Launch } from '../../api/bordrless';
import { CardTitle, Field, Headline, Notice, NumberInput, QuickPicks, Row } from '../ui';
import { MobileSummary } from '../MobileSummary';
import { ShareButton } from '../ShareButton';
import { TokenLookup } from '../TokenLookup';
import { HalfLifeChart } from '../HalfLifeChart';
import { buildShareUrl, primitivesFrom } from '../../lib/urlState';
import { MCAP_PICKS, sol } from './FeeCalculator';

interface State {
  tokens: string;
  hours: number;
  wait: number;
  mcap: string;
  topUp: string;
}

const INITIAL: State = { tokens: '1000000', hours: 3, wait: 6, mcap: '20000', topUp: '' };

function fromUrl(params: URLSearchParams): Partial<State> {
  return primitivesFrom(INITIAL, params);
}

const MAX_H = HALF_LIFE.zeroAfterSecs / 3_600;
const STEP_H = HALF_LIFE.halfLifeSecs / 3_600;
const TOKEN_PICKS = ['100000', '1000000', '5000000', '10000000'];
const WAIT_PICKS = [1, 3, 6, 12, 24];
/** The launch config Half-Life coins launch from: creator fee 1%, no kit rules. */
const HALF_LIFE_RULES = { ...NO_RULES, creatorFeeBps: HALF_LIFE.creatorFeeBps };

const feePct = (hours: number) => halfLifeFeePpm(hours * 3_600) / 1e6;
const hoursLabel = (h: number) => t.common.hours(Math.round(h * 100) / 100);

export function HalfLifeCalculator() {
  const [s, setS] = usePersistentState<State>('halflife', INITIAL, { page: ROUTES.halflife, fromUrl });
  const [launch, setLaunch] = usePersistentState<Launch | null>('halflife-token', null);
  const { solUsd } = useOverview();
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));
  const ids = { tokens: useId(), held: useId(), wait: useId(), mcap: useId(), topUp: useId() };
  const resultsRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const tokens = parseAmount(s.tokens);
  const mcapUsd = parseAmount(s.mcap);
  const topUp = s.topUp ? parseAmount(s.topUp) : 0;
  const tokensValid = Number.isFinite(tokens) && tokens > 0;
  const mcapValid = Number.isFinite(mcapUsd) && mcapUsd > 0;
  const topUpValid = Number.isFinite(topUp) && topUp >= 0;

  const live = launch ? reservesOf(launch) : null;
  const pool = live
    ? modelPool(live, launch?.supply ? BigInt(launch.supply) : TOKEN_SUPPLY)
    : modelLaunch(virtualQuoteForSolPrice(solUsd), (mcapValid ? mcapUsd : 20_000) / solUsd);
  const rules = launch ? launch.rules : HALF_LIFE_RULES;
  const price = spotPrice(pool.now);

  // the holding's age once fresh tokens join it (the hook's blend; bought tokens arrive "now")
  const hours = s.hours;
  const blendedHours =
    topUpValid && topUp > 0 && tokensValid
      ? (() => {
          const now = 1_000_000_000n;
          const since = now - BigInt(Math.round(hours * 3_600));
          const after = halfLifeBlend(BigInt(Math.round(tokens * 1e6)), since, BigInt(Math.round(topUp * 1e6)), now);
          return Number(now - after) / 3_600;
        })()
      : null;
  const later = Math.min(MAX_H, hours + s.wait);

  const sellAt = (h: number) =>
    tokensValid ? quoteTrade({ side: 'sell', amount: tokens, rules, reserves: pool.now, holdersOn: launch?.holdersOn ?? true, halfLifeAgeSecs: h * 3_600 }) : null;
  const now = sellAt(hours);
  const after = sellAt(later);
  const gain = now?.ok && after?.ok ? after.received - now.received : 0;
  const nextBoundary = Math.min(MAX_H, (Math.floor(hours / STEP_H) + 1) * STEP_H);
  const $ = (v: number) => usd(v * solUsd);

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.calc.tabs.halflife}>
        <Field label={t.lookup.label} hint={t.lookup.hint} optional>
          <TokenLookup token={launch} onChange={setLaunch} />
        </Field>
        {launch && !launch.halfLife && <Notice tone="warn">{t.halflife.notHalfLife}</Notice>}

        <Field label={t.halflife.tokens} htmlFor={ids.tokens} hint={tokensValid ? `${t.halflife.tokensHint} ≈ ${$(tokens * price)}` : t.halflife.tokensHint}>
          <NumberInput id={ids.tokens} value={s.tokens} onChange={(v) => set('tokens', v)} suffix={launch?.symbol ?? t.common.tokens} placeholder="1000000" invalid={s.tokens !== '' && !tokensValid} />
          <QuickPicks label={t.common.quick} values={TOKEN_PICKS.map((v) => ({ value: v, label: num(Number(v), 0) }))} current={tokensValid ? String(tokens) : undefined} onPick={(v) => set('tokens', v)} />
        </Field>

        <Field label={t.halflife.held} htmlFor={ids.held} aside={<span className="num text-sm font-semibold text-ink">{hoursLabel(hours)}</span>}>
          <input
            id={ids.held}
            type="range"
            min={0}
            max={MAX_H}
            step={0.25}
            value={hours}
            onChange={(e) => set('hours', Number(e.target.value))}
            className="range"
            style={{ ['--fill' as string]: `${(hours / MAX_H) * 100}%` }}
          />
        </Field>

        <Field label={t.halflife.wait} htmlFor={ids.wait} aside={<span className="num text-sm font-semibold text-ink">{hoursLabel(s.wait)}</span>} hint={t.halflife.waitHint}>
          <input
            id={ids.wait}
            type="range"
            min={0}
            max={MAX_H}
            step={0.25}
            value={s.wait}
            onChange={(e) => set('wait', Number(e.target.value))}
            className="range"
            style={{ ['--fill' as string]: `${(s.wait / MAX_H) * 100}%` }}
          />
          <QuickPicks label={t.common.quick} values={WAIT_PICKS.map((v) => ({ value: String(v), label: `${v}h` }))} current={String(s.wait)} onPick={(v) => set('wait', Number(v))} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          {launch ? (
            <Field label={t.common.mcap} hint={t.profit.entryFromToken}>
              <div className="num flex h-12 items-center rounded border border-line bg-surface-2 px-3.5 text-base font-semibold text-ink">{compactUsd(launch.mcapUsd)}</div>
            </Field>
          ) : (
            <Field label={t.fee.mcapInput} htmlFor={ids.mcap} hint={t.halflife.mcapHint}>
              <NumberInput id={ids.mcap} value={s.mcap} onChange={(v) => set('mcap', v)} prefix="$" placeholder="20000" invalid={s.mcap !== '' && !mcapValid} />
              <QuickPicks label={t.common.quick} values={MCAP_PICKS.map((v) => ({ value: v, label: compactUsd(Number(v)) }))} current={mcapValid ? String(mcapUsd) : undefined} onPick={(v) => set('mcap', v)} />
            </Field>
          )}
          <Field label={t.halflife.topUp} htmlFor={ids.topUp} hint={t.halflife.topUpHint} optional>
            <NumberInput id={ids.topUp} value={s.topUp} onChange={(v) => set('topUp', v)} suffix={launch?.symbol ?? t.common.tokens} placeholder="0" invalid={s.topUp !== '' && !topUpValid} />
            {blendedHours !== null && (
              <p className="mt-2 text-[13px] leading-snug text-ink-2">{t.halflife.topUpResult(hoursLabel(blendedHours), pct(feePct(blendedHours)))}</p>
            )}
          </Field>
        </div>

        <div>
          <h2 className="display text-[1.75rem] text-ink">{t.halflife.chart}</h2>
          <div className="mt-3 overflow-hidden">
            <HalfLifeChart hours={hours} later={later} />
          </div>
        </div>

        <div className="rounded border border-line bg-surface-2 p-3.5">
          <p className="label font-semibold text-ink">{t.halflife.rules}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            {t.halflife.rulesList.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-ink" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside ref={resultsRef} className="card self-start p-4 sm:p-6 lg:sticky lg:top-24" aria-label={t.halflife.results}>
        <CardTitle aside={<ShareButton getUrl={() => buildShareUrl(ROUTES.halflife, { tokens: s.tokens, hours: s.hours, wait: s.wait, mcap: s.mcap })} />}>
          {t.halflife.results}
        </CardTitle>
        {now?.ok ? (
          <>
            <div className="mt-5">
              <Headline
                label={t.halflife.feeNow}
                value={pct(feePct(hours))}
                tone={feePct(hours) > 0 ? 'neg' : 'pos'}
                sub={feePct(hours) > 0 ? t.halflife.nextHalving(hoursLabel(nextBoundary - hours), pct(feePct(nextBoundary))) : t.halflife.gone}
              />
            </div>
            <dl className="mt-5 divide-y divide-line border-t border-ink">
              <Row label={t.halflife.furnace} value={num(now.halfLifeTokens, 0)} sub={t.halflife.furnaceSub} tone={now.halfLifeTokens > 0 ? 'neg' : undefined} />
              <Row label={t.halflife.furnaceValue} value={sol(now.halfLifeSol)} sub={$(now.halfLifeSol)} />
              <Row label={t.halflife.intoPool} value={num(tokens - now.halfLifeTokens - now.burnTokens, 0)} />
              {now.creatorFee > 0 && <Row label={t.halflife.creator} value={sol(now.creatorFee)} />}
              <Row label={t.halflife.share} value={sol(now.protocolFee)} sub={t.halflife.shareSub} />
              <Row label={t.halflife.lp} value={sol(now.lpFee)} sub={pct(now.lpFeeBps / 10_000)} />
              <Row label={t.halflife.received} value={sol(now.received)} sub={$(now.received)} strong />
            </dl>

            <div className="mt-4 rounded border border-ink bg-deep p-3.5 text-on-deep">
              <p className="label opacity-80">{t.halflife.compare}</p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <dt className="label opacity-70">{t.halflife.now}</dt>
                  <dd className="num text-base font-semibold">{sol(now.received)}</dd>
                  <dd className="label opacity-70">{pct(feePct(hours))}</dd>
                </div>
                <div>
                  <dt className="label opacity-70">{t.halflife.later(hoursLabel(s.wait))}</dt>
                  <dd className="num text-base font-semibold">{after?.ok ? sol(after.received) : '–'}</dd>
                  <dd className="label opacity-70">{pct(feePct(later))}</dd>
                </div>
              </dl>
              <p className="num mt-3 border-t border-line-strong pt-2 text-sm font-semibold">
                {gain > 0 ? `${t.halflife.gain(sol(gain))} · ${$(gain)}` : t.halflife.noGain}
              </p>
            </div>
          </>
        ) : now?.failure ? (
          <div className="mt-4">
            <Notice tone="warn">{t.fee.failure[now.failure]}</Notice>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.halflife.enter}</p>
        )}
      </aside>

      <MobileSummary
        resultsRef={resultsRef}
        containerRef={containerRef}
        label={now?.ok ? t.halflife.feeNow : t.halflife.enter}
        value={now?.ok ? pct(feePct(hours)) : undefined}
        detail={now?.ok ? `${t.halflife.received}: ${sol(now.received)}` : undefined}
        tone={now?.ok && feePct(hours) > 0 ? 'neg' : undefined}
      />
    </div>
  );
}
