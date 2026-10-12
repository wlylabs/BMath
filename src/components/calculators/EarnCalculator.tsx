'use client';

import { useId, useRef } from 'react';
import { COMPANIONS, earnings, LAUNCH_FEE_SOL, type CompanionId } from '../../lib/bordrless';
import { compactUsd, parseAmount, pct } from '../../lib/format';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useOverview } from '../../hooks/useOverview';
import type { Launch } from '../../api/bordrless';
import { CardTitle, Field, Headline, Notice, NumberInput, Pills, QuickPicks, Row, Segmented } from '../ui';
import { MobileSummary } from '../MobileSummary';
import { ShareButton } from '../ShareButton';
import { TokenLookup } from '../TokenLookup';
import { INITIAL_RULES, RULE_MODES, RulesPicker, rulesFrom, type RulesState } from '../RulesPicker';
import { buildShareUrl, primitivesFrom } from '../../lib/urlState';
import { sol } from './FeeCalculator';

type Period = 'day' | 'week' | 'month';

interface State extends RulesState {
  volume: string;
  buyShare: number;
  holding: string;
  companion: CompanionId;
  period: Period;
}

const COMPANION_IDS = Object.keys(COMPANIONS) as CompanionId[];

const INITIAL: State = { ...INITIAL_RULES, mode: 'diamond-hands', volume: '100', buyShare: 50, holding: '1', companion: 'none', period: 'day' };

function fromUrl(params: URLSearchParams): Partial<State> {
  return primitivesFrom(INITIAL, params, { mode: RULE_MODES, companion: COMPANION_IDS, period: ['day', 'week', 'month'] });
}

const DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };
const VOLUME_PICKS = ['25', '100', '250', '1000', '5000'];
const HOLDING_PICKS = ['0.1', '0.5', '1', '2', '5'];

export function EarnCalculator() {
  const [s, setS] = usePersistentState<State>('earn', INITIAL, { page: ROUTES.earn, fromUrl });
  const [launch, setLaunch] = usePersistentState<Launch | null>('earn-token', null);
  const { solUsd } = useOverview();
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));
  const ids = { volume: useId(), share: useId(), holding: useId(), companion: useId(), period: useId() };
  const resultsRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const volume = parseAmount(s.volume);
  const holding = parseAmount(s.holding);
  const volumeValid = Number.isFinite(volume) && volume >= 0;
  const holdingValid = Number.isFinite(holding) && holding >= 0 && holding <= 100;
  const rules = launch ? launch.rules : rulesFrom(s);
  const days = DAYS[s.period];
  // a live token splits its creator fee the way its own companion does (or not at all, without one)
  const liveSplit = launch ? (launch.companion ?? COMPANIONS.none) : null;

  const e = volumeValid
    ? earnings({ volumeSol: volume * days, buyShare: s.buyShare / 100, rules, holdingShare: holdingValid ? holding / 100 : 0, companion: s.companion, split: liveSplit })
    : null;
  const $ = (v: number) => compactUsd(v * solUsd);
  const split = liveSplit ?? COMPANIONS[s.companion];

  return (
    <div ref={containerRef} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-6">
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.calc.tabs.earn}>
        <Field label={t.lookup.label} hint={t.lookup.hint} optional>
          <TokenLookup
            token={launch}
            onChange={(l) => {
              setLaunch(l);
              // a freshly picked token starts from its own 24 h volume
              if (l && l.mint !== launch?.mint && l.volume24hSol > 0) set('volume', String(Math.round(l.volume24hSol * 100) / 100));
            }}
          />
        </Field>

        {launch ? <Notice>{t.common.rulesFromToken}</Notice> : <RulesPicker value={s} onChange={(r) => setS((p) => ({ ...p, ...r }))} />}

        <Field label={t.earn.volume} htmlFor={ids.volume} hint={volumeValid ? `${t.earn.volumeHint} ≈ ${$(volume)}` : t.earn.volumeHint}>
          <NumberInput id={ids.volume} value={s.volume} onChange={(v) => set('volume', v)} suffix="SOL" placeholder="100" invalid={s.volume !== '' && !volumeValid} />
          <QuickPicks label={t.common.quick} values={VOLUME_PICKS.map((v) => ({ value: v, label: `${Number(v).toLocaleString('en-US')} SOL` }))} current={volumeValid ? String(volume) : undefined} onPick={(v) => set('volume', v)} />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label={t.earn.buyShare} htmlFor={ids.share} aside={<span className="num text-sm font-semibold text-ink">{s.buyShare}%</span>}>
            <input
              id={ids.share}
              type="range"
              min={0}
              max={100}
              step={5}
              value={s.buyShare}
              onChange={(ev) => set('buyShare', Number(ev.target.value))}
              className="range"
              style={{ ['--fill' as string]: `${s.buyShare}%` }}
            />
          </Field>
          <Field label={t.earn.holding} htmlFor={ids.holding} hint={t.earn.holdingHint}>
            <NumberInput id={ids.holding} value={s.holding} onChange={(v) => set('holding', v)} suffix="%" placeholder="1" invalid={s.holding !== '' && !holdingValid} />
            <QuickPicks label={t.common.quick} values={HOLDING_PICKS.map((v) => ({ value: v, label: `${v}%` }))} current={holdingValid ? String(holding) : undefined} onPick={(v) => set('holding', v)} />
          </Field>
        </div>

        {launch ? (
          <Notice>
            {launch.companion
              ? t.earn.liveCompanion(pct(launch.companion.holders, { digits: 0 }), pct(launch.companion.launcher, { digits: 0 }), pct(launch.companion.buyback, { digits: 0 }))
              : t.earn.liveNoCompanion}
          </Notice>
        ) : (
          <Field label={t.earn.companion} labelId={ids.companion} hint={t.earn.companionSub[s.companion]}>
            <Pills label={t.earn.companion} labelledBy={ids.companion} options={COMPANION_IDS.map((c) => ({ value: c, label: t.earn.companions[c] }))} value={s.companion} onChange={(v) => set('companion', v)} />
            <p className="mt-2 text-[13px] leading-snug text-muted">{t.earn.companionHint}</p>
          </Field>
        )}

        <div className="rounded border border-line bg-surface-2 p-3.5 text-sm text-ink-2">
          <p className="label font-semibold text-ink">{t.earn.launchCost}</p>
          <p className="mt-1">{t.earn.launchCostValue(String(LAUNCH_FEE_SOL))}</p>
          {split !== COMPANIONS.none && <p className="mt-1">{t.earn.bounty}</p>}
        </div>
      </section>

      <aside ref={resultsRef} className="card self-start p-4 sm:p-6 lg:sticky lg:top-24" aria-label={t.earn.results}>
        <CardTitle
          aside={
            <ShareButton
              getUrl={() =>
                buildShareUrl(ROUTES.earn, {
                  mode: s.mode,
                  ...(s.mode === 'custom' ? { creator: s.creator, holderBuy: s.holderBuy, holderSell: s.holderSell, burnBuy: s.burnBuy, burnSell: s.burnSell } : {}),
                  volume: s.volume,
                  buyShare: s.buyShare,
                  holding: s.holding,
                  companion: s.companion,
                  period: s.period,
                })
              }
            />
          }
        >
          {t.earn.results}
        </CardTitle>
        <div className="mt-4">
          <Segmented
            label={t.earn.period}
            options={(['day', 'week', 'month'] as Period[]).map((p) => ({ value: p, label: t.earn.periods[p] }))}
            value={s.period}
            onChange={(v) => set('period', v)}
          />
        </div>
        {e ? (
          <>
            <div className="mt-5">
              <Headline
                label={t.earn.yours}
                value={sol(e.yours)}
                tone={e.yours > 0 ? 'pos' : undefined}
                sub={<span className="num">{$(e.yours)}</span>}
              />
            </div>
            <dl className="mt-5 divide-y divide-line border-t border-ink">
              <Row label={t.earn.creator} value={e.creatorFees > 0 ? sol(e.toLauncher) : t.earn.creatorNone} sub={e.creatorFees > 0 ? $(e.toLauncher) : undefined} tone={e.creatorFees > 0 ? undefined : 'muted'} />
              {split.buyback > 0 && <Row label={t.earn.buyback} value={sol(e.toBuyback)} sub={$(e.toBuyback)} />}
              <Row label={t.earn.holders} value={sol(e.toHolders)} sub={$(e.toHolders)} />
              {e.burned > 0 && <Row label={t.earn.burned} value={sol(e.burned)} sub={$(e.burned)} />}
              <Row label={t.earn.protocol} value={sol(e.protocol)} sub={t.earn.protocolSub} />
              <Row label={t.earn.tradersPay} value={sol(e.tradersPay)} sub={volume > 0 ? pct(e.tradersPay / (volume * days)) : undefined} strong />
            </dl>
            {launch && !launch.holdersOn && launch.rules.holderFeeBuyBps + launch.rules.holderFeeSellBps > 0 && (
              <div className="mt-4">
                <Notice>{t.lookup.holdersOff}</Notice>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.earn.enter}</p>
        )}
      </aside>

      <MobileSummary
        resultsRef={resultsRef}
        containerRef={containerRef}
        label={e ? `${t.earn.yours} · ${t.earn.periods[s.period]}` : t.earn.enter}
        value={e ? sol(e.yours) : undefined}
        detail={e ? `${t.earn.creator}: ${sol(e.toLauncher)}` : undefined}
        tone={e && e.yours > 0 ? 'pos' : undefined}
      />
    </div>
  );
}
