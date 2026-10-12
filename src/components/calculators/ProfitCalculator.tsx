'use client';

import { useId, useMemo, useRef } from 'react';
import { virtualQuoteForSolPrice } from '../../lib/bordrless';
import { breakEvenMcap, graduationInfo, modelLaunch, modelPool, roundTrip } from '../../lib/roundtrip';
import { compactUsd, multiple, num, parseAmount, pct } from '../../lib/format';
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
import { MCAP_PICKS, SOL_PICKS, sol } from './FeeCalculator';

interface State extends RulesState {
  amount: string;
  entry: string;
  exitMode: 'mcap' | 'multiple';
  exit: string;
  multiple: string;
  holdersOn: boolean;
  halfLife: boolean;
  holdHours: number;
}

const INITIAL: State = {
  ...INITIAL_RULES,
  amount: '1',
  entry: '10000',
  exitMode: 'multiple',
  exit: '45000',
  multiple: '3',
  holdersOn: true,
  halfLife: false,
  holdHours: 24,
};

function fromUrl(params: URLSearchParams): Partial<State> {
  return primitivesFrom(INITIAL, params, { exitMode: ['mcap', 'multiple'], mode: RULE_MODES });
}

const MULTIPLE_PICKS = ['1.5', '2', '3', '5', '10'];

export function ProfitCalculator() {
  const [s, setS] = usePersistentState<State>('profit', INITIAL, { page: ROUTES.profit, fromUrl });
  const [launch, setLaunch] = usePersistentState<Launch | null>('profit-token', null);
  const { solUsd } = useOverview();
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));
  const ids = { amount: useId(), entry: useId(), exit: useId(), mult: useId(), mode: useId(), hold: useId() };
  const resultsRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const amount = parseAmount(s.amount);
  const entryUsd = parseAmount(s.entry);
  const exitUsd = parseAmount(s.exit);
  const mult = parseAmount(s.multiple);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const entryValid = Number.isFinite(entryUsd) && entryUsd > 0;
  const exitValid = Number.isFinite(exitUsd) && exitUsd > 0;
  const multValid = Number.isFinite(mult) && mult > 0;

  const rules = launch ? launch.rules : rulesFrom(s);
  const holdersOn = launch ? launch.holdersOn : s.holdersOn;
  const live = launch ? reservesOf(launch) : null;

  const vq = virtualQuoteForSolPrice(solUsd);
  const pool = useMemo(
    () => (live ? modelPool(live, launch?.supply ? BigInt(launch.supply) : 1_000_000_000_000_000n) : modelLaunch(vq, (entryValid ? entryUsd : 10_000) / solUsd)),
    // live reserves are a new object on every render; their values are what matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [launch?.fetchedAt, launch?.mint, vq, entryUsd, entryValid, solUsd],
  );

  // a live token buys at its pool as it is; a modelled one at the entered market cap
  const entryMcapSol = live ? null : (entryValid ? entryUsd : 10_000) / solUsd;
  const entryNowSol = live ? (launch?.mcapSol ?? 0) : entryMcapSol!;
  const exitMcapSol = s.exitMode === 'multiple' ? (multValid ? entryNowSol * mult : NaN) : exitValid ? exitUsd / solUsd : NaN;
  const ready = amountValid && Number.isFinite(exitMcapSol) && exitMcapSol > 0 && (live ? true : entryValid);
  // a Half-Life token always charges its exit fee; otherwise the switch decides
  const halfLife = launch?.halfLife || s.halfLife;
  const halfLifeHours = halfLife ? s.holdHours : null;

  const result = ready ? roundTrip({ pool, amount, entryMcap: entryMcapSol, exitMcap: exitMcapSol, rules, holdersOn, halfLifeHours }) : null;
  const be = ready ? breakEvenMcap({ pool, amount, entryMcap: entryMcapSol, rules, holdersOn, halfLifeHours }) : null;
  const grad = graduationInfo(pool, entryMcapSol);
  const $ = (v: number) => compactUsd(v * solUsd);
  const win = result ? result.net >= 0 : false;

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.calc.tabs.profit}>
        <Field label={t.lookup.label} hint={t.lookup.hint} optional>
          <TokenLookup token={launch} onChange={setLaunch} />
        </Field>

        {launch ? <Notice>{t.common.rulesFromToken}</Notice> : <RulesPicker value={s} onChange={(r) => setS((p) => ({ ...p, ...r }))} />}

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.profit.amount} htmlFor={ids.amount} hint={amountValid ? t.profit.usd(compactUsd(amount * solUsd)) : undefined}>
            <NumberInput id={ids.amount} value={s.amount} onChange={(v) => set('amount', v)} suffix="SOL" placeholder="1" invalid={s.amount !== '' && !amountValid} />
            <QuickPicks label={t.common.quick} values={SOL_PICKS.map((v) => ({ value: v, label: `${v} SOL` }))} current={amountValid ? String(amount) : undefined} onPick={(v) => set('amount', v)} />
          </Field>
          {launch ? (
            <Field label={t.profit.entry} hint={t.profit.entryFromToken}>
              <div className="num flex h-12 items-center rounded border border-line bg-surface-2 px-3.5 text-base font-semibold text-ink">{compactUsd(launch.mcapUsd)}</div>
            </Field>
          ) : (
            <Field label={t.profit.entry} htmlFor={ids.entry} hint={t.fee.mcapHint}>
              <NumberInput id={ids.entry} value={s.entry} onChange={(v) => set('entry', v)} prefix="$" placeholder="10000" invalid={s.entry !== '' && !entryValid} />
              <QuickPicks label={t.common.quick} values={MCAP_PICKS.map((v) => ({ value: v, label: compactUsd(Number(v)) }))} current={entryValid ? String(entryUsd) : undefined} onPick={(v) => set('entry', v)} />
            </Field>
          )}
        </div>

        <Field label={t.profit.exitMode} labelId={ids.mode}>
          <Segmented
            label={t.profit.exitMode}
            labelledBy={ids.mode}
            options={[
              { value: 'multiple', label: t.profit.byMultiple },
              { value: 'mcap', label: t.profit.byMcap },
            ]}
            value={s.exitMode}
            onChange={(v) => set('exitMode', v)}
          />
          <div className="mt-4">
            {s.exitMode === 'multiple' ? (
              <Field label={t.profit.multiple} htmlFor={ids.mult} hint={multValid ? `${t.profit.exitValue}: ${$(entryNowSol * mult)}` : undefined}>
                <NumberInput id={ids.mult} value={s.multiple} onChange={(v) => set('multiple', v)} suffix="×" placeholder="3" invalid={s.multiple !== '' && !multValid} />
                <QuickPicks label={t.common.quick} values={MULTIPLE_PICKS.map((v) => ({ value: v, label: `${v}×` }))} current={multValid ? String(mult) : undefined} onPick={(v) => set('multiple', v)} />
              </Field>
            ) : (
              <Field label={t.profit.exitMcap} htmlFor={ids.exit}>
                <NumberInput id={ids.exit} value={s.exit} onChange={(v) => set('exit', v)} prefix="$" placeholder="45000" invalid={s.exit !== '' && !exitValid} />
                <QuickPicks label={t.common.quick} values={['20000', '45000', '100000', '250000', '1000000'].map((v) => ({ value: v, label: compactUsd(Number(v)) }))} current={exitValid ? String(exitUsd) : undefined} onPick={(v) => set('exit', v)} />
              </Field>
            )}
          </div>
        </Field>

        <div className="space-y-3">
          {!launch && rules.holderFeeBuyBps + rules.holderFeeSellBps > 0 && (
            <Switch checked={s.holdersOn} onChange={(v) => set('holdersOn', v)} label={t.common.holdersOn} hint={t.common.holdersOnHint} />
          )}
          {!launch?.halfLife && <Switch checked={s.halfLife} onChange={(v) => set('halfLife', v)} label={t.common.halfLife} hint={t.common.halfLifeHint} />}
          {halfLife && (
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

        {grad && (
          <div className="rounded border border-line bg-surface-2 p-3.5">
            <p className="label font-semibold text-ink">{t.profit.graduation}</p>
            <p className="mt-1 text-sm text-ink-2">{t.profit.graduationAt($(grad.mcap), num(grad.raise, 2))}</p>
            <p className="mt-1 text-sm text-ink-2">{t.profit.toGraduate(num(grad.left, 2))}</p>
            {Number.isFinite(exitMcapSol) && exitMcapSol > grad.mcap && <p className="mt-1 text-sm text-ink-2">{t.profit.afterGraduation}</p>}
          </div>
        )}
      </section>

      <aside ref={resultsRef} className="card self-start p-4 sm:p-6 lg:sticky lg:top-24" aria-label={t.profit.results}>
        <CardTitle
          aside={
            <ShareButton
              getUrl={() =>
                buildShareUrl(ROUTES.profit, {
                  mode: s.mode,
                  ...(s.mode === 'custom' ? { creator: s.creator, holderBuy: s.holderBuy, holderSell: s.holderSell, burnBuy: s.burnBuy, burnSell: s.burnSell } : {}),
                  amount: s.amount,
                  entry: s.entry,
                  exitMode: s.exitMode,
                  exit: s.exit,
                  multiple: s.multiple,
                })
              }
            />
          }
        >
          {t.profit.results}
        </CardTitle>
        {result && result.ok ? (
          <>
            <div className="mt-5">
              <Headline
                label={win ? t.profit.net : t.profit.netLoss}
                value={`${result.net >= 0 ? '+' : '−'}${sol(Math.abs(result.net))}`}
                tone={win ? 'pos' : 'neg'}
                sub={
                  <span>
                    <span className={win ? 'num font-semibold text-pos' : 'num font-semibold text-neg'}>{pct(result.roi, { signed: true })}</span> {t.profit.roi} · <span className="num">{$(result.net)}</span>
                  </span>
                }
              />
            </div>
            <dl className="mt-5 divide-y divide-line border-t border-ink">
              <Row label={t.profit.spent} value={sol(amount)} sub={`${t.common.mcap} ${$(result.entryMcap)}`} />
              <Row label={t.profit.tokens} value={num(result.tokens, 0)} />
              <Row label={t.profit.buyFees} value={sol(result.feesBuy)} sub={pct(result.buy.feeRate)} />
              <Row label={t.profit.sellFees} value={sol(result.feesSell)} sub={result.sell ? pct(result.sell.feeRate) : undefined} tone={halfLife && halfLifeHours! < 48 ? 'neg' : undefined} />
              <Row label={t.profit.impact} value={sol(result.impact)} sub={t.fee.impactSub} tone="muted" />
              <Row label={t.profit.back} value={sol(result.back)} sub={`${t.common.mcap} ${$(result.exitMcap)}`} strong />
            </dl>
            <div className="mt-4 rounded border border-ink bg-deep px-3.5 py-3 text-on-deep">
              <p className="label opacity-80">{t.profit.breakEven}</p>
              {be ? (
                <p className="num mt-1 text-lg font-semibold">
                  {multiple(be / result.entryMcap)} <span className="text-sm font-normal opacity-80">· {$(be)}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm font-semibold">{t.profit.breakEvenNever}</p>
              )}
              <p className="label mt-1 opacity-70">{t.profit.breakEvenSub}</p>
            </div>
            <div className="mt-4 space-y-2 empty:hidden">
              {launch && !launch.holdersOn && launch.rules.holderFeeBuyBps + launch.rules.holderFeeSellBps > 0 && <Notice>{t.lookup.holdersOff}</Notice>}
              {launch?.halfLife ? <Notice>{t.lookup.halfLife}</Notice> : launch?.customHook && <Notice tone="warn">{t.lookup.customHook}</Notice>}
            </div>
          </>
        ) : result && !result.ok ? (
          <div className="mt-4">
            <Notice tone="warn">{t.fee.failure[result.sell?.failure ?? result.buy.failure ?? 'insufficient_liquidity']}</Notice>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.profit.enter}</p>
        )}
      </aside>

      <MobileSummary
        resultsRef={resultsRef}
        containerRef={containerRef}
        label={result?.ok ? (win ? t.profit.net : t.profit.netLoss) : t.profit.enter}
        value={result?.ok ? `${result.net >= 0 ? '+' : '−'}${sol(Math.abs(result.net))}` : undefined}
        detail={result?.ok ? pct(result.roi, { signed: true }) : undefined}
        tone={result?.ok ? (win ? 'pos' : 'neg') : undefined}
      />
    </div>
  );
}
