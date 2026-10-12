import { applySwap, earnings, mcapSol, quoteTrade, spotPrice, TOKEN_DECIMALS, type Rules } from './bordrless';
import type { PoolModel } from './roundtrip';

/**
 * The Holder Simulator: buy a bag at today's price, then live through days of trading and see
 * what the holder rewards pay you. The fees are the launch's own rules through `earnings`; what is
 * made up is the market (volume and where the market cap drifts), from a seeded random walk, so
 * the same seed always plays the same game.
 */

export type ScenarioId = 'quiet' | 'steady' | 'busy' | 'viral';

export interface Scenario {
  id: ScenarioId;
  /** Typical volume per day, in SOL, at the least. */
  volumeSol: number;
  /** Typical volume per day as a share of the market cap, so a bigger token trades more. */
  turnover: number;
  /** How far the market cap climbs over the first month, as a multiple; it then holds there. */
  mcapMultiple: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'quiet', volumeSol: 5, turnover: 0.05, mcapMultiple: 1.5 },
  { id: 'steady', volumeSol: 20, turnover: 0.15, mcapMultiple: 3 },
  { id: 'busy', volumeSol: 80, turnover: 0.4, mcapMultiple: 6 },
  { id: 'viral', volumeSol: 300, turnover: 1, mcapMultiple: 15 },
];

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export type DayEvent = 'big' | 'quiet' | null;

export interface SimDay {
  day: number;
  volumeSol: number;
  event: DayEvent;
  /** Market cap at the end of the day, in SOL. */
  mcapSol: number;
  /** Your share of the tokens holders hold, 0 to 1. */
  share: number;
  /** What the holder rewards paid you that day, in SOL. */
  reward: number;
  /** Rewards so far, in SOL. */
  total: number;
  /** Tokens the burn rules destroyed that day. */
  burnedTokens: number;
}

export interface SimInput {
  pool: PoolModel;
  rules: Rules;
  /** How a companion splits the creator fee; holders get `holders` of it. */
  split: { buyback: number; holders: number; launcher: number };
  entrySol: number;
  scenario: Scenario;
  days: number;
  seed: number;
}

export interface SimResult {
  ok: boolean;
  tokens: number;
  /** Every fee paid on the way in, in SOL. */
  entryFees: number;
  startMcap: number;
  endMcap: number;
  days: SimDay[];
  totalRewards: number;
  burnedTokens: number;
  /** The first day the rewards have paid back the entry fees, or null within the period. */
  paybackDay: number | null;
  /** What selling the whole bag would return at the end, in SOL, fees included. */
  sellValue: number;
}

/** A day's typical volume in a scenario at a market cap (in SOL). */
export function typicalVolume(s: Scenario, mcapSol: number): number {
  return Math.max(s.volumeSol, s.turnover * mcapSol);
}

/** A small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Days the market cap takes to reach the scenario's multiple. */
export const GROWTH_DAYS = 30;

const tokens = (base: bigint) => Number(base) / 10 ** TOKEN_DECIMALS;

export function simulate(i: SimInput): SimResult {
  const supply = tokens(i.pool.supply);
  const buyInput = { side: 'buy' as const, amount: i.entrySol, rules: i.rules, reserves: i.pool.now };
  const buy = quoteTrade(buyInput);
  const empty: SimResult = { ok: false, tokens: 0, entryFees: 0, startMcap: 0, endMcap: 0, days: [], totalRewards: 0, burnedTokens: 0, paybackDay: null, sellValue: 0 };
  if (!buy.ok || buy.received <= 0) return empty;

  const mine = buy.received;
  // the market starts where your own buy leaves it
  const startMcap = mcapSol(applySwap(i.pool.now, 'buy', buyInput), i.pool.supply);
  // the market cap climbs for a month, then holds
  const mcapOn = (d: number) => startMcap * Math.max(1, i.scenario.mcapMultiple) ** (Math.min(d, GROWTH_DAYS) / GROWTH_DAYS);
  const endMcap = mcapOn(i.days);
  const random = rng(i.seed);

  const days: SimDay[] = [];
  let total = 0;
  let burned = 0;
  let paybackDay: number | null = null;
  for (let d = 1; d <= i.days; d++) {
    const roll = random();
    const event: DayEvent = roll < 0.1 ? 'big' : roll > 0.85 ? 'quiet' : null;
    const swing = 0.6 + random() * 0.8;
    const buyShare = 0.45 + random() * 0.15;

    const mcap = mcapOn(d);
    const volumeSol = typicalVolume(i.scenario, mcap) * (event === 'big' ? 3 : event === 'quiet' ? 0.3 : swing);
    const pool = i.pool.at(mcap);
    // tokens out of the pool are in holders' hands, yours among them; on the curve the quarter
    // of the supply kept for the graduation pool is not
    const kept = pool.virtualQuote > 0n && i.pool.curve ? tokens(i.pool.curve.reserveTokens) : 0;
    const held = Math.max(mine, supply - kept - tokens(pool.baseReserve));
    const share = mine / held;

    const e = earnings({ volumeSol, buyShare, rules: i.rules, holdingShare: share, companion: 'none', split: i.split });
    const price = spotPrice(pool);
    const burnedTokens = price > 0 ? e.burned / price : 0;
    total += e.yours;
    burned += burnedTokens;
    if (paybackDay === null && total >= buy.totalFeesSol) paybackDay = d;
    days.push({ day: d, volumeSol, event, mcapSol: mcap, share, reward: e.yours, total, burnedTokens });
  }

  const sell = quoteTrade({ side: 'sell', amount: mine, rules: i.rules, reserves: i.pool.at(endMcap) });
  return {
    ok: true,
    tokens: mine,
    entryFees: buy.totalFeesSol,
    startMcap,
    endMcap,
    days,
    totalRewards: total,
    burnedTokens: burned,
    paybackDay,
    sellValue: sell.ok ? sell.received : 0,
  };
}

export type Rank = 'tourist' | 'holder' | 'diamond' | 'legend';

/** A title for the run, from the rewards as a share of the SOL put in. */
export function rankOf(totalRewards: number, entrySol: number): Rank {
  const y = entrySol > 0 ? totalRewards / entrySol : 0;
  if (y >= 1) return 'legend';
  if (y >= 0.25) return 'diamond';
  if (y >= 0.05) return 'holder';
  return 'tourist';
}
