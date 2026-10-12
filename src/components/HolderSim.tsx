'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Video } from 'lucide-react';
import { COMPANIONS, quoteTrade, TOKEN_DECIMALS, TOKEN_SUPPLY } from '../lib/bordrless';
import { compactUsd, num, parseAmount, pct } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { modelPool } from '../lib/roundtrip';
import { PERIODS, rankOf, SCENARIOS, simulate, typicalVolume, type DayEvent, type PeriodDays, type Rank, type ScenarioId } from '../lib/holderSim';
import { backtest, downsample } from '../lib/backtest';
import { ROUTES } from '../lib/routes';
import { bordrlessTokenUrl, OUR_TOKEN, SITE_URL } from '../lib/site';
import { reservesOf, type Candle, type Launch } from '../api/bordrless';
import { TokenLookup } from './TokenLookup';
import { useLaunch } from '../hooks/useLaunch';
import { useCandles } from '../hooks/useCandles';
import { useOverview } from '../hooks/useOverview';
import { usePersistentState } from '../hooks/usePersistentState';
import { Field, Headline, Notice, NumberInput, QuickPicks, Row, Segmented, prefersReducedMotion, useFlash } from './ui';
import { PixelIcon } from './PixelIcon';
import { sol } from './calculators/FeeCalculator';

type Mode = 'history' | 'future';

interface Setup {
  mode: Mode;
  entry: string;
  scenario: ScenarioId;
  days: PeriodDays;
}

interface Run extends Omit<Setup, 'entry'> {
  entry: number;
  seed: number;
  /** The token the run played, kept so picking another one leaves the result as it was. */
  token: { mint: string; symbol: string; name: string };
}

interface Best {
  sol: number;
  /** What the best run was, e.g. "30 days" or "held 2.3 days". */
  label: string;
  rank: Rank | null;
}

/** One step of a run, whichever mode played it: a simulated day, or a slice of the real chart. */
interface Step {
  /** Rewards so far, in SOL. */
  total: number;
  reward: number;
  event: DayEvent;
  mcapUsd: number;
  /** Where the step sits in the run, 0 to 1. */
  x: number;
  /** A simulated day's volume, in SOL. */
  volumeSol?: number;
  /** The run panel's header for this step. */
  label: string;
}

/** A finished run, in the shape the results panel and the video read. */
interface Outcome {
  ok: boolean;
  mode: Mode;
  steps: Step[];
  totalRewards: number;
  entryFees: number;
  payback: string | null;
  shareStart: number;
  shareEnd: number;
  mcapStartUsd: number;
  mcapEndUsd: number;
  athUsd: number | null;
  burnedTokens: number;
  sellValue: number;
  /** "30 days" or "2.3 days", for the share text, the best run and the file name. */
  span: string;
}

type Split = { buyback: number; holders: number; launcher: number };

const INITIAL: Setup = { mode: 'history', entry: '1', scenario: 'steady', days: 30 };
const NO_BEST: Best = { sol: 0, label: '', rank: null };
const ENTRY_PICKS = ['0.1', '0.5', '1', '2', '5'];
/** The whole run plays out in about this long, whatever its length. */
const PLAY_MS = 2_400;

/** The rank's tile in the video, in the light theme's colours. */
const RANK_VIDEO: Record<Rank, { bg: string; fg: string }> = {
  tourist: { bg: '#ebebe8', fg: '#0e0e0e' },
  holder: { bg: '#2aa7a0', fg: '#151515' },
  diamond: { bg: '#1f3dff', fg: '#ffffff' },
  legend: { bg: '#f2c53d', fg: '#151515' },
};

const RANK_TILE: Record<Rank, string> = {
  tourist: 'bg-surface-2 text-ink',
  holder: 'bg-teal text-[#151515]',
  diamond: 'bg-spot text-white',
  legend: 'bg-sun text-[#151515]',
};

export function HolderSim() {
  // any Bordrless token by CA, name or ticker; $BMATH until one is picked
  const [picked, setPicked] = usePersistentState<Launch | null>('play-token', null);
  const ours = useLaunch(OUR_TOKEN.mint);
  const launch = picked ?? ours.launch;
  const failed = !picked && ours.failed;
  const symbol = launch?.symbol ?? OUR_TOKEN.symbol;
  const paysHolders = !launch || launch.rules.holderFeeBuyBps + launch.rules.holderFeeSellBps > 0 || (launch.companion?.holders ?? 0) > 0;
  const { solUsd } = useOverview();
  const [setup, setSetup] = usePersistentState<Setup>('play', INITIAL);
  const mode = setup.mode;
  const history = useCandles(mode === 'history' && launch ? launch.mint : null);
  const [best, setBest] = usePersistentState<Best>('play-best', NO_BEST);
  const [game, setGame] = useState<{ run: Run; outcome: Outcome; newBest: boolean } | null>(null);
  const [shown, setShown] = useState(0);
  const [shared, flashShared] = useFlash();
  const ids = { entry: useId(), market: useId(), period: useId(), mode: useId() };
  const runRef = useRef<HTMLElement>(null);

  const pool = useMemo(() => {
    const live = launch ? reservesOf(launch) : null;
    return live && launch ? modelPool(live, launch.supply ? BigInt(launch.supply) : TOKEN_SUPPLY) : null;
  }, [launch]);
  const split = launch?.companion ?? COMPANIONS.none;

  const entry = parseAmount(setup.entry);
  const entryValid = Number.isFinite(entry) && entry >= 0.01 && entry <= 100;
  const preview = pool && launch && entryValid && mode === 'future' ? quoteTrade({ side: 'buy', amount: entry, rules: launch.rules, reserves: pool.now }) : null;
  const noHistory = mode === 'history' && history.candles !== null && history.candles.length === 0;
  const ready = !!pool && !!launch && entryValid && (mode === 'future' || (history.candles?.length ?? 0) > 0);

  // a run is played out in full when it starts; its steps are then only revealed
  const run = game?.run ?? null;
  const outcome = game?.outcome ?? null;
  const total = outcome?.steps.length ?? 0;
  const done = outcome !== null && outcome.ok && shown >= total;
  const now = outcome && shown > 0 ? outcome.steps[Math.min(shown, total) - 1]! : null;
  const rank = outcome && done ? rankOf(outcome.totalRewards, run!.entry) : null;

  // reveal the steps a tick at a time
  useEffect(() => {
    if (!outcome || shown >= total) return;
    const step = Math.max(1, Math.ceil(total / 30));
    const id = setTimeout(() => setShown((s) => Math.min(total, s + step)), PLAY_MS / Math.ceil(total / step));
    return () => clearTimeout(id);
  }, [outcome, shown, total]);

  const start = () => {
    if (!ready || !pool || !launch) return;
    const next: Run = { mode, entry, scenario: setup.scenario, days: setup.days, seed: newSeed(), token: { mint: launch.mint, symbol: launch.symbol, name: launch.name } };
    const played = mode === 'history' ? playHistory(launch, history.candles!, entry, solUsd, split) : playFuture(pool, launch, entry, next, split, solUsd);
    const newBest = played.ok && played.totalRewards > best.sol;
    // saved now, shown once the run has played out
    if (newBest) setBest({ sol: played.totalRewards, label: mode === 'history' ? t.play.held(played.span) : played.span, rank: rankOf(played.totalRewards, entry) });
    setGame({ run: next, outcome: played, newBest });
    setShown(prefersReducedMotion() ? Number.POSITIVE_INFINITY : 0);
    // on one column the run sits below the button; bring it into view to watch it play
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      runRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const share = async () => {
    if (!outcome || !run || !rank) return;
    const rankName = t.play.ranks[rank].name;
    const text =
      outcome.mode === 'history'
        ? t.play.shareTextHistory(num(outcome.totalRewards, 3), outcome.span, rankName, run.token.symbol)
        : t.play.shareText(num(outcome.totalRewards, 3), run.days, rankName, run.token.symbol);
    const result = await shareLink(`${SITE_URL}${ROUTES.play}`, t.play.title, text);
    if (result === 'copied') {
      toast(t.play.shareCopied);
      flashShared();
    } else if (result === 'failed') toast(t.share.failed);
  };

  const [making, setMaking] = useState<number | null>(null);
  const saveVideo = async () => {
    if (!outcome || !run || !rank || making !== null) return;
    setMaking(0);
    try {
      const { renderRunVideo } = await import('../lib/runVideo');
      const history = outcome.mode === 'history';
      const video = await renderRunVideo(
        {
          entrySol: run.entry,
          steps: outcome.steps,
          chart: history ? 'line' : 'bars',
          athUsd: outcome.athUsd ?? undefined,
          rank: { name: t.play.ranks[rank].name, ...RANK_VIDEO[rank] },
          symbol: run.token.symbol,
          name: run.token.name,
          mintShort: `${run.token.mint.slice(0, 4)}…${run.token.mint.slice(-4)}`,
          url: `${SITE_URL.replace(/^https?:\/\//, '')}${ROUTES.play.replace(/\/$/, '')}`,
          text: {
            hookLine: history ? t.play.video.hookHistory(outcome.span) : t.play.video.hookLine(run.days, t.play.scenarios[run.scenario].name),
            progress: (i, n) => (history ? (outcome.steps[Math.max(0, i - 1)]?.label ?? '').toUpperCase() : t.play.video.day(i, n)),
            chartTitle: t.play.video.chartTitle,
            mcap: (usd) => compactUsd(usd),
            buy: t.play.youBuy.toUpperCase(),
            now: t.play.now.toUpperCase(),
            ath: t.play.ath,
            bigDay: t.play.video.bigDay,
            slowDay: t.play.video.slowDay,
            rankLabel: t.play.video.rankLabel,
            rankHidden: t.play.video.rankHidden,
            payback: history ? t.play.video.paybackAfter(outcome.payback) : t.play.video.payback(outcome.payback ? Number(outcome.payback) : null),
            share: t.play.video.share(pct(outcome.shareStart), pct(outcome.shareEnd)),
            cta: t.play.video.cta,
            madeWith: history ? t.play.video.madeWithHistory : t.play.video.madeWith,
            disclaimer: history ? t.play.video.disclaimerHistory : t.play.video.disclaimer,
          },
        },
        (p) => setMaking(Math.round(p * 100)),
      );
      const slug = run.token.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'token';
      const file = new File([video.blob], `bmath-${slug}-${history ? 'since-launch' : `${run.days}d`}.${video.extension}`, { type: video.blob.type });
      // phones get the share sheet, which can post it or save it to the gallery
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t.play.title }).catch(() => undefined);
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast(t.play.video.saved);
      }
    } catch {
      toast(t.play.video.failed);
    } finally {
      setMaking(null);
    }
  };

  // the whole chart since launch as soon as a token is picked, before any run
  const previewSteps = useMemo(() => {
    const candles = history.candles;
    if (mode !== 'history' || !launch || !candles?.length) return null;
    const supply = Number(launch.supply ? BigInt(launch.supply) : TOKEN_SUPPLY) / 10 ** TOKEN_DECIMALS;
    const t0 = candles[0]!.t;
    const len = Math.max(1, candles.at(-1)!.t - t0);
    const pts = downsample(candles.map((c) => ({ t: c.t, mcapUsd: c.c * supply, total: 0 })), 240);
    return {
      steps: pts.map((p): Step => ({ total: 0, reward: 0, event: null, mcapUsd: p.mcapUsd, x: (p.t - t0) / len, label: '' })),
      athUsd: Math.max(...candles.map((c) => Math.max(c.h, c.c))) * supply,
    };
  }, [mode, launch, history.candles]);
  const previewSpan = history.candles?.length ? span(history.candles.at(-1)!.t - history.candles[0]!.t) : null;
  const chartMode: Mode = outcome?.mode ?? mode;

  const $ = (v: number) => compactUsd(v * solUsd);
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((p) => ({ ...p, [k]: v }));
  const playing = outcome !== null && outcome.ok && !done;
  const isHistory = outcome?.mode === 'history';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_480px] lg:gap-6">
      {/* the setup: a mode, the token, the bag, and for a simulated run the market and how long */}
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.play.title}>
        <Field label={t.play.mode} labelId={ids.mode}>
          <Segmented
            label={t.play.mode}
            labelledBy={ids.mode}
            options={(['history', 'future'] as Mode[]).map((m) => ({ value: m, label: t.play.modes[m], sub: t.play.modeSubs[m] }))}
            value={mode}
            onChange={(v) => set('mode', v)}
          />
        </Field>

        <Field label={<StepLabel n={1}>{t.play.token}</StepLabel>} hint={t.play.tokenHint}>
          <TokenLookup token={picked} onChange={setPicked} />
          {!paysHolders && (
            <div className="mt-3">
              <Notice tone="warn">{t.play.noRewards(symbol)}</Notice>
            </div>
          )}
        </Field>

        <Field
          label={<StepLabel n={2}>{t.play.bag}</StepLabel>}
          htmlFor={ids.entry}
          hint={!entryValid && setup.entry !== '' ? t.play.bagInvalid : mode === 'history' ? t.play.historyIntro(symbol) : preview?.ok ? t.play.bagHint(compactCount(preview.received), symbol) : undefined}
        >
          <NumberInput id={ids.entry} value={setup.entry} onChange={(v) => set('entry', v)} suffix="SOL" placeholder="1" invalid={setup.entry !== '' && !entryValid} />
          <QuickPicks label={t.common.quick} values={ENTRY_PICKS.map((v) => ({ value: v, label: `${v} SOL` }))} current={entryValid ? String(entry) : undefined} onPick={(v) => set('entry', v)} />
        </Field>

        {mode === 'future' && (
          <>
            <Field label={<StepLabel n={3}>{t.play.market}</StepLabel>} labelId={ids.market}>
              <div role="radiogroup" aria-labelledby={ids.market} className="grid grid-cols-2 gap-2.5">
                {SCENARIOS.map((s) => {
                  const on = s.id === setup.scenario;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set('scenario', s.id)}
                      className={cx(
                        'press flex min-h-24 flex-col items-start rounded border-2 p-3 text-left transition-colors',
                        on ? 'border-ink bg-sun text-[#151515] shadow-[3px_3px_0_0_var(--cast)]' : 'border-line bg-surface-2 text-ink hover:border-ink',
                      )}
                    >
                      <span className="display text-2xl">{t.play.scenarios[s.id].name}</span>
                      <span className={cx('label mt-1 leading-snug', on ? 'text-[#151515]' : 'text-muted')}>
                        {t.play.scenarioBody(compactCount(typicalVolume(s, launch?.mcapSol ?? 0)), `${s.mcapMultiple}×`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label={<StepLabel n={4}>{t.play.period}</StepLabel>} labelId={ids.period}>
              <Segmented
                label={t.play.period}
                labelledBy={ids.period}
                options={PERIODS.map((d) => ({ value: String(d) as `${PeriodDays}`, label: t.play.days(d) }))}
                value={String(setup.days) as `${PeriodDays}`}
                onChange={(v) => set('days', Number(v) as PeriodDays)}
              />
            </Field>
          </>
        )}

        <div className="space-y-3 border-t-2 border-ink pt-5">
          <button type="button" onClick={start} disabled={!ready || playing} className="btn btn-sun h-14 w-full text-lg disabled:opacity-50">
            <PixelIcon name="play" className="size-5" />
            {outcome ? t.play.again : t.play.start}
          </button>
          {!launch && !failed && (
            <p className="label text-muted" role="status">
              {t.play.loading}
            </p>
          )}
          {launch && mode === 'history' && history.loading && (
            <p className="label text-muted" role="status">
              {t.play.loadingHistory}
            </p>
          )}
          {failed && <Notice tone="warn">{t.play.unavailable}</Notice>}
          {mode === 'history' && history.failed && <Notice tone="warn">{t.play.historyFailed}</Notice>}
          {noHistory && <Notice>{t.play.noHistory}</Notice>}
          <p className="text-[13px] leading-snug text-muted">{mode === 'history' ? t.play.historyAssumptions : t.play.assumptions}</p>
        </div>
      </section>

      {/* the run, its chart first */}
      <aside ref={runRef} className="card scroll-mt-20 self-start overflow-hidden lg:sticky lg:top-24" aria-label={t.play.run}>
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-deep px-4 py-3 text-on-deep sm:px-6">
          <p className="label">{outcome ? (now?.label ?? outcome.steps[0]?.label ?? t.play.run) : t.play.run}</p>
          {playing && (
            <button type="button" onClick={() => setShown(total)} className="label underline underline-offset-2">
              {t.play.skip}
            </button>
          )}
        </div>

        <div className="p-4 sm:p-6">
          {/* the chart leads; the money follows */}
          <div>
            <p className="label text-muted">{chartMode === 'history' ? t.play.chartHistory : t.play.chart}</p>
            {isHistory ? (
              <McapChart steps={outcome!.steps} shown={Math.min(shown, total)} done={done} athUsd={outcome!.athUsd ?? 0} />
            ) : !outcome && previewSteps ? (
              <McapChart steps={previewSteps.steps} shown={previewSteps.steps.length} done={false} preview athUsd={previewSteps.athUsd} />
            ) : (
              <DayBars steps={outcome?.steps ?? null} shown={shown} />
            )}
            <p className="label mt-2 min-h-5 text-ink-2" aria-live="polite">
              {!outcome
                ? previewSteps
                  ? t.play.previewLine(symbol, previewSpan!)
                  : t.play.idle
                : !now
                  ? ''
                  : isHistory
                    ? t.play.historyLine(compactUsd(now.mcapUsd), sol(now.total))
                    : now.event
                      ? t.play.events[now.event]
                      : t.play.dayLine(sol(now.reward), num(now.volumeSol ?? 0, 0))}
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <Headline label={t.play.earned} value={sol(now?.total ?? 0)} tone={now && now.total > 0 ? 'pos' : undefined} sub={<span className="num">{$(now?.total ?? 0)}</span>} />
          </div>

          {outcome && done && rank && run && (
            <div className="mt-5 space-y-4">
              <div className={cx('rise border-2 border-ink p-4 shadow-[3px_3px_0_0_var(--cast)]', RANK_TILE[rank])}>
                <p className="label opacity-80">{t.play.run}</p>
                <p className="display mt-1 text-4xl">{t.play.ranks[rank].name}</p>
                <p className="mt-1 text-[15px] leading-snug">{t.play.ranks[rank].body}</p>
              </div>

              <dl className="divide-y divide-line border-t border-ink">
                <Row label={t.play.entryFees} value={sol(outcome.entryFees)} sub={$(outcome.entryFees)} />
                <Row
                  label={t.play.payback}
                  value={outcome.payback ? (isHistory ? t.play.paybackAfter(outcome.payback) : t.play.paybackDay(Number(outcome.payback))) : t.play.paybackNever}
                  tone={outcome.payback ? 'pos' : 'muted'}
                />
                <Row label={t.play.share} value={`${pct(outcome.shareStart)} → ${pct(outcome.shareEnd)}`} />
                <Row label={isHistory ? t.play.mcapHistory : t.play.mcap} value={`${compactUsd(outcome.mcapStartUsd)} → ${compactUsd(outcome.mcapEndUsd)}`} />
                {outcome.athUsd !== null && <Row label={t.play.athRow} value={compactUsd(outcome.athUsd)} />}
                {outcome.burnedTokens > 0 && <Row label={t.play.burned} value={`${compactCount(outcome.burnedTokens)} $${run.token.symbol}`} />}
                <Row label={isHistory ? t.play.sellNow : t.play.sell} value={sol(outcome.sellValue)} sub={$(outcome.sellValue)} strong />
              </dl>

              <div className="flex items-center justify-between gap-3 rounded border border-line bg-surface-2 px-3 py-2.5">
                <p className="label text-muted">{game?.newBest ? t.play.newBest : t.play.best}</p>
                <p className="num text-sm font-semibold text-ink">
                  {sol(best.sol)}
                  {best.label ? ` · ${best.label}` : ''}
                </p>
              </div>

              <div className="grid gap-2.5">
                <a href={bordrlessTokenUrl(run.token.mint)} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-12">
                  {t.play.buy(run.token.symbol)}
                  <PixelIcon name="external" className="size-3.5" />
                </a>
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={saveVideo} disabled={making !== null} aria-live="polite" className="btn btn-sun h-12 disabled:opacity-80">
                    <Video aria-hidden className="size-4" />
                    {making !== null ? t.play.video.making(making) : t.play.video.button}
                  </button>
                  <button type="button" onClick={share} className="btn h-12">
                    {shared ? <Check aria-hidden className="size-4 text-pos" /> : <PixelIcon name="share" className="size-4" />}
                    {t.play.shareButton}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** The real chart: a bag bought at the token's launch, held until its last candle. */
function playHistory(launch: Launch, candles: Candle[], entry: number, solUsd: number, split: Split): Outcome {
  // the token's own SOL price, where the API gives both, matches its USD figures best
  const usdPerSol = launch.mcapUsd && launch.mcapSol ? launch.mcapUsd / launch.mcapSol : solUsd;
  const r = backtest({
    candles,
    rules: launch.rules,
    split,
    reserves: reservesOf(launch),
    supply: launch.supply ? BigInt(launch.supply) : TOKEN_SUPPLY,
    graduatedAt: launch.graduatedAt,
    solUsd: usdPerSol,
    entrySol: entry,
  });
  const spanOf = (t: number) => span(t - r.start);
  const len = Math.max(1, r.end - r.start);
  return {
    ok: r.ok,
    mode: 'history',
    steps: r.points.map((p, i) => ({
      total: p.total,
      reward: i ? p.total - r.points[i - 1]!.total : p.total,
      event: null,
      mcapUsd: p.mcapUsd,
      x: (p.t - r.start) / len,
      label: i ? t.play.since(spanOf(p.t)) : t.play.youBuy,
    })),
    totalRewards: r.totalRewards,
    entryFees: r.entryFees,
    payback: r.paybackT !== null ? span(Math.max(300, r.paybackT - r.start)) : null,
    shareStart: r.shareStart,
    shareEnd: r.shareNow,
    mcapStartUsd: r.entryMcapUsd,
    mcapEndUsd: r.nowMcapUsd,
    athUsd: r.athMcapUsd,
    burnedTokens: r.burnedTokens,
    sellValue: r.sellValue,
    span: span(r.end - r.start),
  };
}

/** A simulated market from today on. */
function playFuture(pool: ReturnType<typeof modelPool>, launch: Launch, entry: number, run: Run, split: Split, solUsd: number): Outcome {
  const scenario = SCENARIOS.find((s) => s.id === run.scenario)!;
  const r = simulate({ pool, rules: launch.rules, split, entrySol: entry, scenario, days: run.days, seed: run.seed });
  return {
    ok: r.ok,
    mode: 'future',
    steps: r.days.map((d) => ({
      total: d.total,
      reward: d.reward,
      event: d.event,
      mcapUsd: d.mcapSol * solUsd,
      volumeSol: d.volumeSol,
      x: d.day / run.days,
      label: t.play.day(d.day, run.days),
    })),
    totalRewards: r.totalRewards,
    entryFees: r.entryFees,
    payback: r.paybackDay !== null ? String(r.paybackDay) : null,
    shareStart: r.days[0]?.share ?? 0,
    shareEnd: r.days.at(-1)?.share ?? 0,
    mcapStartUsd: r.startMcap * solUsd,
    mcapEndUsd: r.endMcap * solUsd,
    athUsd: null,
    burnedTokens: r.burnedTokens,
    sellValue: r.sellValue,
    span: t.play.days(run.days),
  };
}

/** One bar per simulated day; big days in sun, slow ones grey. */
function DayBars({ steps, shown }: { steps: Step[] | null; shown: number }) {
  const max = steps ? Math.max(...steps.map((d) => d.reward), 1e-12) : 1;
  return (
    <div className="mt-2 flex h-24 items-end gap-px border-b-2 border-ink" aria-hidden>
      {steps
        ? steps.map((d, i) => (
            <span
              key={i}
              className={cx('min-w-0 flex-1 transition-[height] duration-200', d.event === 'big' ? 'bg-sun' : d.event === 'quiet' ? 'bg-line-strong' : 'bg-teal')}
              style={{ height: i < shown ? `${Math.max(3, (d.reward / max) * 100)}%` : '0%' }}
            />
          ))
        : Array.from({ length: 30 }, (_, i) => <span key={i} className="min-w-0 flex-1 bg-line/60" style={{ height: `${20 + ((i * 37) % 60)}%` }} />)}
    </div>
  );
}

/**
 * The market cap since launch on a log scale, drawn as far as the run has got, with the value the
 * head is at, launch and now along the bottom and the all-time high once it is all in. Before a
 * run it shows the whole chart, muted.
 */
function McapChart({ steps, shown, done, preview, athUsd }: { steps: Step[]; shown: number; done: boolean; preview?: boolean; athUsd: number }) {
  const W = 400;
  const H = 220;
  const pad = { t: 16, b: 6 };
  const lo = Math.log(Math.max(1, Math.min(...steps.map((s) => s.mcapUsd))) * 0.85);
  const hi = Math.log(Math.max(...steps.map((s) => s.mcapUsd)) * 1.12);
  const X = (s: Step) => s.x * W;
  const Y = (m: number) => pad.t + (H - pad.t - pad.b) * (1 - (Math.log(Math.max(1, m)) - lo) / (hi - lo || 1));
  const upto = preview ? steps : steps.slice(0, Math.max(1, shown));
  const line = upto.map((s, i) => `${i ? 'L' : 'M'}${X(s).toFixed(1)} ${Y(s.mcapUsd).toFixed(1)}`).join('');
  const head = upto.at(-1)!;
  const first = steps[0]!;
  const ath = steps.reduce((a, s) => (s.mcapUsd > a.mcapUsd ? s : a), first);
  const stroke = preview ? 'var(--line-strong)' : 'var(--teal)';
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="num text-2xl font-semibold text-ink">{compactUsd(head.mcapUsd)}</p>
        {(done || preview) && (
          <p className="label text-muted">
            {t.play.ath} <span className="num font-semibold text-ink">{compactUsd(athUsd)}</span>
          </p>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block h-56 w-full overflow-visible border-b-2 border-ink sm:h-64" role="img" aria-label={t.play.chartHistory}>
        {[1, 2, 3].map((k) => (
          <line key={k} x1={0} x2={W} y1={(H * k) / 4} y2={(H * k) / 4} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {upto.length > 1 && (
          <>
            <path d={`${line}L${X(head).toFixed(1)} ${H}L${X(first).toFixed(1)} ${H}Z`} fill={stroke} opacity={preview ? 0.12 : 0.16} />
            <path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* markers sit outside the stretched SVG so they stay round */}
      <div className="relative -mt-56 h-56 sm:-mt-64 sm:h-64" aria-hidden>
        <Marker x={first.x} y={Y(first.mcapUsd) / H} className="bg-ink" />
        {(done || preview) && ath !== head && <Marker x={ath.x} y={Y(ath.mcapUsd) / H} className="bg-sun" />}
        {!preview && <Marker x={head.x} y={Y(head.mcapUsd) / H} className={done ? 'bg-teal' : 'bg-sun'} />}
      </div>
      <div className="label mt-1.5 flex justify-between text-muted">
        <span>{t.play.youBuy} · {compactUsd(first.mcapUsd)}</span>
        <span>{t.play.now}</span>
      </div>
    </div>
  );
}

function Marker({ x, y, className }: { x: number; y: number; className: string }) {
  return <span className={cx('absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink', className)} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />;
}

/** 2.3 days, 5 h or 20 min. */
function span(secs: number): string {
  const h = secs / 3_600;
  if (h >= 48) return `${num(h / 24, 1)} days`;
  if (h >= 1) return `${num(h, h < 10 ? 1 : 0)} h`;
  return `${Math.max(1, Math.round(secs / 60))} min`;
}

function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="num flex size-6 items-center justify-center bg-deep text-xs text-on-deep">
        {n}
      </span>
      {children}
    </span>
  );
}

/** A fresh seed per run, so every run plays a different market. */
function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

/** 12,345,678 as 12.3M. */
function compactCount(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
