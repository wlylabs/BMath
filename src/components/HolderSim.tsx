'use client';

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { COMPANIONS, quoteTrade, TOKEN_SUPPLY } from '../lib/bordrless';
import { compactUsd, num, parseAmount, pct } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { modelPool } from '../lib/roundtrip';
import { PERIODS, rankOf, SCENARIOS, simulate, type PeriodDays, type Rank, type ScenarioId, type SimResult } from '../lib/holderSim';
import { ROUTES } from '../lib/routes';
import { bordrlessTokenUrl, OUR_TOKEN, SITE_URL } from '../lib/site';
import { reservesOf } from '../api/bordrless';
import { useLaunch } from '../hooks/useLaunch';
import { useOverview } from '../hooks/useOverview';
import { usePersistentState } from '../hooks/usePersistentState';
import { Field, Headline, Notice, NumberInput, QuickPicks, Row, Segmented, prefersReducedMotion, useFlash } from './ui';
import { PixelIcon } from './PixelIcon';
import { sol } from './calculators/FeeCalculator';

interface Setup {
  entry: string;
  scenario: ScenarioId;
  days: PeriodDays;
}

interface Run extends Omit<Setup, 'entry'> {
  entry: number;
  seed: number;
}

interface Best {
  sol: number;
  days: number;
  rank: Rank | null;
}

const INITIAL: Setup = { entry: '1', scenario: 'steady', days: 30 };
const NO_BEST: Best = { sol: 0, days: 0, rank: null };
const ENTRY_PICKS = ['0.1', '0.5', '1', '2', '5'];
/** The whole run plays out in about this long, whatever its length. */
const PLAY_MS = 2_400;

const RANK_TILE: Record<Rank, string> = {
  tourist: 'bg-surface-2 text-ink',
  holder: 'bg-teal text-[#151515]',
  diamond: 'bg-spot text-white',
  legend: 'bg-sun text-[#151515]',
};

export function HolderSim() {
  const { launch, failed } = useLaunch(OUR_TOKEN.mint);
  const { solUsd } = useOverview();
  const [setup, setSetup] = usePersistentState<Setup>('play', INITIAL);
  const [best, setBest] = usePersistentState<Best>('play-best', NO_BEST);
  const [game, setGame] = useState<{ run: Run; result: SimResult; newBest: boolean } | null>(null);
  const [shown, setShown] = useState(0);
  const [shared, flashShared] = useFlash();
  const ids = { entry: useId(), market: useId(), period: useId() };
  const runRef = useRef<HTMLElement>(null);

  const pool = useMemo(() => {
    const live = launch ? reservesOf(launch) : null;
    return live && launch ? modelPool(live, launch.supply ? BigInt(launch.supply) : TOKEN_SUPPLY) : null;
  }, [launch]);
  const split = launch?.companion ?? COMPANIONS.none;

  const entry = parseAmount(setup.entry);
  const entryValid = Number.isFinite(entry) && entry >= 0.01 && entry <= 100;
  const preview = pool && launch && entryValid ? quoteTrade({ side: 'buy', amount: entry, rules: launch.rules, reserves: pool.now }) : null;

  // a run is played out in full when it starts; the days are then only revealed
  const run = game?.run ?? null;
  const result = game?.result ?? null;
  const total = result?.days.length ?? 0;
  const done = result !== null && result.ok && shown >= total;
  const today = result && shown > 0 ? result.days[Math.min(shown, total) - 1]! : null;
  const rank = result && done ? rankOf(result.totalRewards, run!.entry) : null;

  // reveal the days one tick at a time
  useEffect(() => {
    if (!result || shown >= total) return;
    const step = Math.max(1, Math.ceil(total / 30));
    const id = setTimeout(() => setShown((s) => Math.min(total, s + step)), PLAY_MS / Math.ceil(total / step));
    return () => clearTimeout(id);
  }, [result, shown, total]);

  const start = () => {
    if (!entryValid || !pool || !launch) return;
    const next: Run = { entry, scenario: setup.scenario, days: setup.days, seed: newSeed() };
    const scenario = SCENARIOS.find((s) => s.id === next.scenario)!;
    const played = simulate({ pool, rules: launch.rules, split, entrySol: entry, scenario, days: next.days, seed: next.seed });
    const newBest = played.ok && played.totalRewards > best.sol;
    // saved now, shown once the run has played out
    if (newBest) setBest({ sol: played.totalRewards, days: next.days, rank: rankOf(played.totalRewards, entry) });
    setGame({ run: next, result: played, newBest });
    setShown(prefersReducedMotion() ? Number.POSITIVE_INFINITY : 0);
    // on one column the run sits below the button; bring it into view to watch it play
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      runRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const share = async () => {
    if (!result || !run || !rank) return;
    const text = t.play.shareText(num(result.totalRewards, 3), run.days, t.play.ranks[rank].name);
    const outcome = await shareLink(`${SITE_URL}${ROUTES.play}`, t.play.title, text);
    if (outcome === 'copied') {
      toast(t.play.shareCopied);
      flashShared();
    } else if (outcome === 'failed') toast(t.share.failed);
  };

  const $ = (v: number) => compactUsd(v * solUsd);
  const maxReward = result ? Math.max(...result.days.map((d) => d.reward), 1e-12) : 1;
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((p) => ({ ...p, [k]: v }));
  const playing = result !== null && result.ok && !done;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-6">
      {/* the setup: three choices, then one big button */}
      <section className="card space-y-6 p-4 sm:p-6" aria-label={t.play.title}>
        <Field label={<Step n={1}>{t.play.bag}</Step>} htmlFor={ids.entry} hint={!entryValid && setup.entry !== '' ? t.play.bagInvalid : preview?.ok ? t.play.bagHint(compactCount(preview.received)) : undefined}>
          <NumberInput id={ids.entry} value={setup.entry} onChange={(v) => set('entry', v)} suffix="SOL" placeholder="1" invalid={setup.entry !== '' && !entryValid} />
          <QuickPicks label={t.common.quick} values={ENTRY_PICKS.map((v) => ({ value: v, label: `${v} SOL` }))} current={entryValid ? String(entry) : undefined} onPick={(v) => set('entry', v)} />
        </Field>

        <Field label={<Step n={2}>{t.play.market}</Step>} labelId={ids.market}>
          <div role="radiogroup" aria-labelledby={ids.market} className="grid grid-cols-2 gap-2.5">
            {SCENARIOS.map((s) => {
              const on = s.id === setup.scenario;
              const copy = t.play.scenarios[s.id];
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
                  <span className="display text-2xl">{copy.name}</span>
                  <span className={cx('label mt-1 leading-snug', on ? 'text-[#151515]' : 'text-muted')}>{copy.body(num(s.volumeSol, 0), `${s.mcapMultiple}×`)}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={<Step n={3}>{t.play.period}</Step>} labelId={ids.period}>
          <Segmented
            label={t.play.period}
            labelledBy={ids.period}
            options={PERIODS.map((d) => ({ value: String(d) as `${PeriodDays}`, label: t.play.days(d) }))}
            value={String(setup.days) as `${PeriodDays}`}
            onChange={(v) => set('days', Number(v) as PeriodDays)}
          />
        </Field>

        <div className="space-y-3 border-t-2 border-ink pt-5">
          <button type="button" onClick={start} disabled={!pool || !entryValid || playing} className="btn btn-sun h-14 w-full text-lg disabled:opacity-50">
            <PixelIcon name="play" className="size-5" />
            {result ? t.play.again : t.play.start}
          </button>
          {!launch && !failed && (
            <p className="label text-muted" role="status">
              {t.play.loading}
            </p>
          )}
          {failed && <Notice tone="warn">{t.play.unavailable}</Notice>}
          <p className="text-[13px] leading-snug text-muted">{t.play.assumptions}</p>
        </div>
      </section>

      {/* the run */}
      <aside ref={runRef} className="card scroll-mt-20 self-start overflow-hidden lg:sticky lg:top-24" aria-label={t.play.run}>
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-deep px-4 py-3 text-on-deep sm:px-6">
          <p className="label">{result ? t.play.day(Math.min(shown, total), total) : t.play.run}</p>
          {playing && (
            <button type="button" onClick={() => setShown(total)} className="label underline underline-offset-2">
              {t.play.skip}
            </button>
          )}
        </div>

        <div className="p-4 sm:p-6">
          <Headline
            label={t.play.earned}
            value={sol(today?.total ?? 0)}
            tone={today && today.total > 0 ? 'pos' : undefined}
            sub={<span className="num">{$(today?.total ?? 0)}</span>}
          />

          {/* one bar per day; big days in sun, slow ones grey */}
          <div className="mt-5">
            <p className="label text-muted">{t.play.chart}</p>
            <div className="mt-2 flex h-24 items-end gap-px border-b-2 border-ink" aria-hidden>
              {result
                ? result.days.map((d, i) => (
                    <span
                      key={d.day}
                      className={cx('min-w-0 flex-1 transition-[height] duration-200', d.event === 'big' ? 'bg-sun' : d.event === 'quiet' ? 'bg-line-strong' : 'bg-teal')}
                      style={{ height: i < shown ? `${Math.max(3, (d.reward / maxReward) * 100)}%` : '0%' }}
                    />
                  ))
                : Array.from({ length: 30 }, (_, i) => <span key={i} className="min-w-0 flex-1 bg-line/60" style={{ height: `${20 + ((i * 37) % 60)}%` }} />)}
            </div>
            <p className="label mt-2 min-h-5 text-ink-2" aria-live="polite">
              {!result ? t.play.idle : today?.event ? t.play.events[today.event] : today ? t.play.dayLine(sol(today.reward), num(today.volumeSol, 0)) : ''}
            </p>
          </div>

          {result && done && rank && run && (
            <div className="mt-5 space-y-4">
              <div className={cx('rise border-2 border-ink p-4 shadow-[3px_3px_0_0_var(--cast)]', RANK_TILE[rank])}>
                <p className="label opacity-80">{t.play.run}</p>
                <p className="display mt-1 text-4xl">{t.play.ranks[rank].name}</p>
                <p className="mt-1 text-[15px] leading-snug">{t.play.ranks[rank].body}</p>
              </div>

              <dl className="divide-y divide-line border-t border-ink">
                <Row label={t.play.entryFees} value={sol(result.entryFees)} sub={$(result.entryFees)} />
                <Row
                  label={t.play.payback}
                  value={result.paybackDay ? t.play.paybackDay(result.paybackDay) : t.play.paybackNever}
                  tone={result.paybackDay ? 'pos' : 'muted'}
                />
                <Row label={t.play.share} value={`${pct(result.days[0]!.share)} → ${pct(result.days.at(-1)!.share)}`} />
                <Row label={t.play.mcap} value={`${compactUsd(result.startMcap * solUsd)} → ${compactUsd(result.endMcap * solUsd)}`} />
                {result.burnedTokens > 0 && <Row label={t.play.burned} value={`${compactCount(result.burnedTokens)} $${OUR_TOKEN.symbol}`} />}
                <Row label={t.play.sell} value={sol(result.sellValue)} sub={$(result.sellValue)} strong />
              </dl>

              <div className="flex items-center justify-between gap-3 rounded border border-line bg-surface-2 px-3 py-2.5">
                <p className="label text-muted">{game?.newBest ? t.play.newBest : t.play.best}</p>
                <p className="num text-sm font-semibold text-ink">
                  {sol(best.sol)} · {t.play.days(best.days)}
                </p>
              </div>

              <div className="grid gap-2.5">
                <a href={bordrlessTokenUrl(OUR_TOKEN.mint)} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-12">
                  {t.play.buy}
                  <PixelIcon name="external" className="size-3.5" />
                </a>
                <button type="button" onClick={share} className="btn h-12">
                  {shared ? <Check aria-hidden className="size-4 text-pos" /> : <PixelIcon name="share" className="size-4" />}
                  {t.play.shareButton}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
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
