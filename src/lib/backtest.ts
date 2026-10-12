import { earnings, quoteTrade, TOKEN_DECIMALS, virtualQuoteForSolPrice, type Reserves, type Rules } from './bordrless';
import { modelLaunch, modelPool, type PoolModel } from './roundtrip';
import type { Candle } from '../api/bordrless';

/**
 * The Holder Simulator on real history: a bag bought at launch and held until now, with every
 * 5-minute candle's real volume paying holder rewards under the token's own rules. Prices and
 * volume come in USD and are taken to SOL at one SOL price, today's; buys and sells are taken as
 * half of the volume each, and your share is your tokens over every token outside the pool.
 */

export interface HistoryInput {
  candles: Candle[];
  rules: Rules;
  split: { buyback: number; holders: number; launcher: number };
  /** The pool now, from the API; null when the API has none. */
  reserves: Reserves | null;
  /** Total supply now, in base units. */
  supply: bigint;
  /** When the launch graduated, in Unix seconds, or null while it is on the curve. */
  graduatedAt: number | null;
  solUsd: number;
  entrySol: number;
  /** Points kept for the chart; the rewards count every candle. */
  points?: number;
}

export interface HistoryPoint {
  /** Unix seconds. */
  t: number;
  mcapUsd: number;
  /** Rewards paid to you so far, in SOL. */
  total: number;
}

export interface HistoryResult {
  ok: boolean;
  tokens: number;
  entryFees: number;
  points: HistoryPoint[];
  start: number;
  end: number;
  entryMcapUsd: number;
  nowMcapUsd: number;
  athMcapUsd: number;
  athT: number;
  totalRewards: number;
  burnedTokens: number;
  /** When the rewards had paid back the entry fees, in Unix seconds, or null. */
  paybackT: number | null;
  /** What selling the whole bag now would return, in SOL, fees included. */
  sellValue: number;
  shareStart: number;
  shareNow: number;
}

const tokens = (base: bigint) => Number(base) / 10 ** TOKEN_DECIMALS;

export function backtest(i: HistoryInput): HistoryResult {
  const empty: HistoryResult = {
    ok: false, tokens: 0, entryFees: 0, points: [], start: 0, end: 0, entryMcapUsd: 0, nowMcapUsd: 0, athMcapUsd: 0, athT: 0,
    totalRewards: 0, burnedTokens: 0, paybackT: null, sellValue: 0, shareStart: 0, shareNow: 0,
  };
  const candles = i.candles;
  if (!candles.length || !(i.solUsd > 0) || !(i.entrySol > 0)) return empty;
  const supply = tokens(i.supply);
  const toMcapSol = (priceUsd: number) => (priceUsd * supply) / i.solUsd;

  // on the curve the curve decides who holds what; a graduated launch's curve is gone from the API,
  // so it is rebuilt from today's SOL price, as the launch form builds one
  const live = i.reserves && i.reserves.virtualQuote > 0n ? i.reserves.virtualQuote : null;
  const curve: PoolModel = modelLaunch(live ?? virtualQuoteForSolPrice(i.solUsd), toMcapSol(candles[0]!.o));
  const after: PoolModel | null = i.reserves && i.reserves.virtualQuote === 0n ? modelPool(i.reserves, i.supply) : null;
  const onCurve = (t: number) => !after || (i.graduatedAt !== null && t < i.graduatedAt);
  const kept = curve.curve ? tokens(curve.curve.reserveTokens) : 0;
  const heldAt = (t: number, mcap: number) => {
    if (onCurve(t)) return supply - kept - tokens(curve.at(mcap).baseReserve);
    return supply - tokens(after!.at(mcap).baseReserve);
  };

  // bought on the first candle's opening price
  const first = candles[0]!;
  const buy = quoteTrade({ side: 'buy', amount: i.entrySol, rules: i.rules, reserves: curve.at(toMcapSol(first.o)) });
  if (!buy.ok || buy.received <= 0) return empty;
  const mine = buy.received;

  let total = 0;
  let burned = 0;
  let paybackT: number | null = null;
  let ath = { mcap: 0, t: first.t };
  const all: HistoryPoint[] = [];
  let shareStart = 0;
  let share = 0;
  for (const c of candles) {
    const mcap = toMcapSol(c.c);
    share = mine / Math.max(mine, heldAt(c.t, mcap));
    if (!shareStart) shareStart = share;
    const e = earnings({ volumeSol: Math.max(0, c.v) / i.solUsd, buyShare: 0.5, rules: i.rules, holdingShare: share, companion: 'none', split: i.split });
    total += e.yours;
    burned += c.c > 0 ? (e.burned * i.solUsd) / c.c : 0;
    if (paybackT === null && total >= buy.totalFeesSol) paybackT = c.t;
    const high = Math.max(c.h, c.c) * supply;
    if (high > ath.mcap) ath = { mcap: high, t: c.t };
    all.push({ t: c.t, mcapUsd: c.c * supply, total });
  }

  const nowPool = after ?? (i.reserves ? modelPool(i.reserves, i.supply) : null);
  const sell = nowPool ? quoteTrade({ side: 'sell', amount: mine, rules: i.rules, reserves: nowPool.now }) : null;
  const last = candles.at(-1)!;
  return {
    ok: true,
    tokens: mine,
    entryFees: buy.totalFeesSol,
    points: downsample(all, i.points ?? 240),
    start: first.t,
    end: last.t,
    entryMcapUsd: first.o * supply,
    nowMcapUsd: last.c * supply,
    athMcapUsd: ath.mcap,
    athT: ath.t,
    totalRewards: total,
    burnedTokens: burned,
    paybackT,
    sellValue: sell?.ok ? sell.received : 0,
    shareStart,
    shareNow: share,
  };
}

/**
 * Evenly spaced in time, at most `n` points: each keeps the last market cap and total of its slice,
 * the first and last points stay as they are.
 */
export function downsample(points: HistoryPoint[], n: number): HistoryPoint[] {
  if (points.length <= n) return points;
  const start = points[0]!.t;
  const span = points.at(-1)!.t - start || 1;
  const out: HistoryPoint[] = [points[0]!];
  let j = 1;
  for (let k = 1; k < n; k++) {
    const until = start + (span * k) / (n - 1);
    let last: HistoryPoint | null = null;
    while (j < points.length && points[j]!.t <= until) last = points[j++]!;
    if (last) out.push(last);
  }
  if (out.at(-1) !== points.at(-1)) out.push(points.at(-1)!);
  return out;
}
