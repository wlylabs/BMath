'use client';

import { useId, useRef } from 'react';
import {
  headlineFees,
  quoteTrade,
  SNIPER_WINDOW_SECS,
  sniperLpFeeBps,
  spotPrice,
  virtualQuoteForSolPrice,
} from '../../lib/bordrless';
import { modelLaunch, modelPool } from '../../lib/roundtrip';
import { compactUsd, num, parseAmount, pct, usd } from '../../lib/format';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useOverview } from '../../hooks/useOverview';
import { reservesOf, type Launch } from '../../api/bordrless';
import { CardTitle, Field, Headline, Notice, NumberInput, QuickPicks, Row, Segmented, Switch } from '../ui';
import { MobileSummary } from '../MobileSummary';
import { ShareButton } from '../ShareButton';
import { TokenLookup } from '../TokenLookup';
import { INITIAL_RULES, RULE_MODES, RulesPicker, rulesFrom, type RulesState } from '../RulesPicker';
import { buildShareUrl, primitivesFrom } from '../../lib/urlState';

interface State extends RulesState {
  side: 'buy' | 'sell';
  amount: string;
  mcap: string;
  elapsed: number;
  holdersOn: boolean;
  halfLife: boolean;
  holdHours: number;
  firstBuy: boolean;
}

const INITIAL: State = {
  ...INITIAL_RULES,
  side: 'buy',
  amount: '1',
  mcap: '20000',
  elapsed: SNIPER_WINDOW_SECS,
  holdersOn: true,
  halfLife: false,
  holdHours: 0,
  firstBuy: false,
};

function fromUrl(params: URLSearchParams): Partial<State> {
  return primitivesFrom(INITIAL, params, { side: ['buy', 'sell'], mode: RULE_MODES });
}

export const SOL_PICKS = ['0.1', '0.5', '1', '2', '5', '10'];
export const MCAP_PICKS = ['5000', '10000', '20000', '45000', '100000'];

/** SOL with as many decimals as small amounts need. */
export function sol(n: number, digits?: number): string {
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const d = digits ?? (abs === 0 ? 2 : abs < 0.001 ? 6 : abs < 1 ? 4 : abs < 100 ? 3 : 2);
  return `${num(n, d)} SOL`;
}

export function FeeCalculator() {
  const [s, setS] = usePersistentState<State>('fee', INITIAL, { page: ROUTES.fee, fromUrl });
  const [launch, setLaunch] = usePersistentState<Launch | null>('fee-token', null);
  const { solUsd } = useOverview();
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));
  const ids = { amount: useId(), mcap: useId(), side: useId(), elapsed: useId(), hold: useId() };
  const resultsRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const amount = parseAmount(s.amount);
  const mcapUsd = parseAmount(s.mcap);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const mcapValid = Number.isFinite(mcapUsd) && mcapUsd > 0;

  const rules = launch ? launch.rules : rulesFrom(s);
  const holdersOn = launch ? launch.holdersOn : s.holdersOn;
  const live = launch ? reservesOf(launch) : null;
  const supply = launch?.supply ? BigInt(launch.supply) : undefined;
  const pool = live ? modelPool(live, supply ?? 1_000_000_000_000_000n) : modelLaunch(virtualQuoteForSolPrice(solUsd), (mcapValid ? mcapUsd : 20_000) / solUsd);
  const spot = spotPrice(pool.now);
  const elapsed = launch ? SNIPER_WINDOW_SECS : s.elapsed;
  const lpNow = sniperLpFeeBps(elapsed);
  const inSniper = elapsed < SNIPER_WINDOW_SECS;
  const firstBuy = inSniper && s.side === 'buy' && s.firstBuy;
  const halfLife = s.halfLife;

  const result = amountValid
    ? quoteTrade({
        side: s.side,
        // a sell is entered as its value in SOL; the pool takes tokens
        amount: s.side === 'buy' ? amount : spot > 0 ? amount / spot : 0,
        rules,
        reserves: pool.now,
        elapsed,
        holdersOn,
        halfLifeAgeSecs: halfLife && s.side === 'sell' ? s.holdHours * 3_600 : null,
        creatorFirstBuy: firstBuy,
      })
    : null;
  const head = headlineFees(rules, 30, holdersOn);
  const allIn = result ? result.totalFeesSol + result.impactSol : 0;
  const $ = (v: number) => usd(v * solUsd);

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.calc.tabs.fee}>
        <Field label={t.lookup.label} hint={t.lookup.hint} optional>
          <TokenLookup token={launch} onChange={setLaunch} />
        </Field>

        {launch ? (
          <Notice>{t.common.rulesFromToken}</Notice>
        ) : (
          <RulesPicker value={s} onChange={(r) => setS((p) => ({ ...p, ...r }))} />
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.common.side} labelId={ids.side}>
            <Segmented
              label={t.common.side}
              labelledBy={ids.side}
              options={[
                { value: 'buy', label: t.common.buy },
                { value: 'sell', label: t.common.sell },
              ]}
              value={s.side}
              onChange={(v) => set('side', v)}
              tone={(v) => (v === 'buy' ? 'pos' : 'neg')}
            />
          </Field>
          {!launch && (
            <Field label={t.fee.mcapInput} htmlFor={ids.mcap} hint={t.fee.mcapHint}>
              <NumberInput id={ids.mcap} value={s.mcap} onChange={(v) => set('mcap', v)} prefix="$" placeholder="20000" invalid={s.mcap !== '' && !mcapValid} />
              <QuickPicks
                label={t.common.quick}
                values={MCAP_PICKS.map((v) => ({ value: v, label: compactUsd(Number(v)) }))}
                current={mcapValid ? String(mcapUsd) : undefined}
                onPick={(v) => set('mcap', v)}
              />
            </Field>
          )}
        </div>

        <Field label={s.side === 'buy' ? t.common.buy : `${t.common.sell} (${t.common.sol})`} htmlFor={ids.amount} hint={amountValid ? `≈ ${$(amount)}` : undefined}>
          <NumberInput id={ids.amount} value={s.amount} onChange={(v) => set('amount', v)} suffix="SOL" placeholder="1" invalid={s.amount !== '' && !amountValid} />
          <QuickPicks
            label={t.common.quick}
            values={SOL_PICKS.map((v) => ({ value: v, label: `${v} SOL` }))}
            current={amountValid ? String(amount) : undefined}
            onPick={(v) => set('amount', v)}
          />
        </Field>

        {!launch && (
          <Field label={t.common.elapsed} htmlFor={ids.elapsed} aside={<span className="num text-sm font-semibold text-ink">{t.common.elapsedValue(s.elapsed)}</span>} hint={t.common.elapsedHint(pct(lpNow / 10_000))}>
            <input
              id={ids.elapsed}
              type="range"
              min={0}
              max={SNIPER_WINDOW_SECS}
              step={1}
              value={s.elapsed}
              onChange={(e) => set('elapsed', Number(e.target.value))}
              className="range"
              style={{ ['--fill' as string]: `${(s.elapsed / SNIPER_WINDOW_SECS) * 100}%` }}
            />
          </Field>
        )}

        <div className="space-y-3">
          {!launch && rules.holderFeeBuyBps + rules.holderFeeSellBps > 0 && (
            <Switch checked={s.holdersOn} onChange={(v) => set('holdersOn', v)} label={t.common.holdersOn} hint={t.common.holdersOnHint} />
          )}
          {inSniper && s.side === 'buy' && (
            <Switch checked={s.firstBuy} onChange={(v) => set('firstBuy', v)} label={t.common.firstBuy} hint={t.common.firstBuyHint} />
          )}
          {s.side === 'sell' && (
            <Switch checked={s.halfLife} onChange={(v) => set('halfLife', v)} label={t.common.halfLife} hint={t.common.halfLifeHint} />
          )}
          {s.side === 'sell' && s.halfLife && (
            <div className="enter px-1">
              <Field label={t.common.holdAge} htmlFor={ids.hold} aside={<span className="num text-sm font-semibold text-ink">{t.common.hours(s.holdHours)}</span>}>
                <input
                  id={ids.hold}
                  type="range"
                  min={0}
                  max={48}
                  step={1}
                  value={s.holdHours}
                  onChange={(e) => set('holdHours', Number(e.target.value))}
                  className="range"
                  style={{ ['--fill' as string]: `${(s.holdHours / 48) * 100}%` }}
                />
              </Field>
            </div>
          )}
        </div>
      </section>

      <aside ref={resultsRef} className="card self-start p-4 sm:p-6 lg:sticky lg:top-24" aria-label={t.fee.results}>
        <CardTitle
          aside={
            <ShareButton
              getUrl={() =>
                buildShareUrl(ROUTES.fee, {
                  mode: s.mode,
                  ...(s.mode === 'custom' ? { creator: s.creator, holderBuy: s.holderBuy, holderSell: s.holderSell, burnBuy: s.burnBuy, burnSell: s.burnSell } : {}),
                  side: s.side,
                  amount: s.amount,
                  mcap: s.mcap,
                  elapsed: s.elapsed,
                })
              }
            />
          }
        >
          {t.fee.results}
        </CardTitle>
        {result && result.ok ? (
          <>
            <div className="mt-5">
              <Headline
                label={t.fee.total}
                value={sol(result.totalFeesSol)}
                sub={
                  <span>
                    <span className="num font-semibold text-ink">{pct(result.feeRate)}</span> {t.fee.effective} · <span className="num">{$(result.totalFeesSol)}</span>
                  </span>
                }
              />
            </div>
            <dl className="mt-5 divide-y divide-line border-t border-ink">
              {result.creatorFee > 0 && <Row label={t.fee.creator} value={sol(result.creatorFee)} />}
              {result.holderFee > 0 && <Row label={t.fee.holders} value={sol(result.holderFee)} />}
              {result.protocolFee > 0 && <Row label={t.fee.share} value={sol(result.protocolFee)} sub={t.fee.shareSub} />}
              <Row label={inSniper && !firstBuy ? t.fee.lpSniper : t.fee.lp} value={sol(result.lpFee)} sub={pct(result.lpFeeBps / 10_000)} tone={inSniper && !firstBuy ? 'neg' : undefined} />
              {result.burnTokens > 0 && <Row label={t.fee.burn} value={sol(result.burnSol)} sub={t.fee.burnSub(num(result.burnTokens, 0))} />}
              {result.halfLifeTokens > 0 && <Row label={t.fee.halfLife} value={sol(result.halfLifeSol)} sub={t.fee.halfLifeSub(num(result.halfLifeTokens, 0))} tone="neg" />}
              <Row label={t.fee.impact} value={sol(result.impactSol)} sub={`${pct(result.impactRate)} · ${t.fee.impactSub}`} tone="muted" />
              <Row label={t.fee.allIn} value={sol(allIn)} sub={pct(result.valueSol > 0 ? allIn / result.valueSol : 0)} strong />
              <Row
                label={s.side === 'buy' ? t.fee.receivedBuy : t.fee.receivedSell}
                value={s.side === 'buy' ? num(result.received, 0) : sol(result.received)}
                sub={s.side === 'buy' ? `≈ ${$(result.received * result.spotPrice)}` : `≈ ${$(result.received)}`}
                strong
              />
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded border border-ink bg-deep px-3.5 py-2.5 text-on-deep">
              <span className="label opacity-80">{t.fee.headlineLabel}</span>
              <span className="num whitespace-nowrap text-sm font-semibold">{t.fee.headline(pct(Math.ceil(head.buyBps / 10) / 1000, { digits: 1 }), pct(Math.ceil(head.sellBps / 10) / 1000, { digits: 1 }))}</span>
            </div>
            <div className="mt-4 space-y-2 empty:hidden">
              {inSniper && !firstBuy && <Notice tone="warn">{t.fee.sniperWarn(pct(lpNow / 10_000))}</Notice>}
              {launch && !launch.holdersOn && launch.rules.holderFeeBuyBps + launch.rules.holderFeeSellBps > 0 && <Notice>{t.lookup.holdersOff}</Notice>}
              {launch?.customHook && <Notice tone="warn">{t.lookup.customHook}</Notice>}
              {launch && !live && <Notice>{t.lookup.noPool}</Notice>}
            </div>
            <details className="group mt-4 border-t border-line pt-3">
              <summary className="label flex cursor-pointer list-none items-center justify-between font-semibold text-ink-2 hover:text-ink">
                {t.fee.order}
                <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
              </summary>
              <ol className="mt-3 space-y-2">
                {(s.side === 'buy' ? t.fee.orderBuy : t.fee.orderSell).map((step, i) => (
                  <li key={step} className="flex gap-2.5 text-sm text-ink-2">
                    <span className="num flex size-5 shrink-0 items-center justify-center bg-deep text-[11px] text-on-deep">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </details>
            {!launch && <p className="label mt-3 text-muted">{t.fee.model(compactUsd(mcapValid ? mcapUsd : 20_000))}</p>}
          </>
        ) : result && result.failure ? (
          <div className="mt-4">
            <Notice tone="warn">{t.fee.failure[result.failure]}</Notice>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.fee.enterAmount}</p>
        )}
      </aside>

      <MobileSummary
        resultsRef={resultsRef}
        containerRef={containerRef}
        label={result?.ok ? t.fee.total : t.fee.enterAmount}
        value={result?.ok ? sol(result.totalFeesSol) : undefined}
        detail={result?.ok ? `${pct(result.feeRate)} ${t.fee.effective}` : undefined}
        tone={result?.ok && inSniper && !firstBuy ? 'neg' : undefined}
      />
    </div>
  );
}
