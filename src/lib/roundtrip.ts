import {
  curveParams,
  graduationMcapSol,
  LAMPORTS,
  mcapSol,
  quoteTrade,
  reservesAtMcap,
  solToGraduate,
  TOKEN_SUPPLY,
  type CurveParams,
  type Reserves,
  type Rules,
  type TradeResult,
} from './bordrless';

/**
 * Where a pool would sit at another market cap. A pool still on its curve follows the curve (and
 * the graduated pool past it); a graduated pool keeps its constant product.
 */
export interface PoolModel {
  /** The pool now. */
  now: Reserves;
  /** The pool at a market cap in SOL. */
  at: (mcap: number) => Reserves;
  /** The curve, while the launch has not graduated. */
  curve: CurveParams | null;
  supply: bigint;
}

/** A modelled new launch, opening at $5k with this much virtual SOL. */
export function modelLaunch(virtualQuote: bigint, mcapNow: number): PoolModel {
  const curve = curveParams(virtualQuote);
  return { now: reservesAtMcap(mcapNow, curve), at: (m) => reservesAtMcap(m, curve), curve, supply: TOKEN_SUPPLY };
}

/** A live pool from the API. */
export function modelPool(now: Reserves, supply: bigint): PoolModel {
  if (now.virtualQuote > 0n) {
    const curve = curveParams(now.virtualQuote);
    return { now, at: (m) => reservesAtMcap(m, curve), curve, supply };
  }
  const k = Number(now.quoteReserve) * Number(now.baseReserve);
  const S = Number(supply);
  return {
    now,
    at: (m) => {
      const price = (m * LAMPORTS) / S;
      const quote = Math.sqrt(k * price);
      return { baseReserve: BigInt(Math.round(quote / price)), quoteReserve: BigInt(Math.round(quote)), virtualBase: 0n, virtualQuote: 0n };
    },
    curve: null,
    supply,
  };
}

export interface RoundTripInput {
  pool: PoolModel;
  /** SOL spent on the buy. */
  amount: number;
  /** Market cap at the buy, in SOL; null buys into the pool as it is now. */
  entryMcap: number | null;
  /** Market cap at the sale, in SOL. */
  exitMcap: number;
  rules: Rules;
  holdersOn: boolean;
  /** Hours held, for a Half-Life token; null when it is not one. */
  halfLifeHours: number | null;
}

export interface RoundTrip {
  ok: boolean;
  buy: TradeResult;
  sell: TradeResult | null;
  tokens: number;
  back: number;
  net: number;
  roi: number;
  feesBuy: number;
  feesSell: number;
  impact: number;
  entryMcap: number;
  exitMcap: number;
}

export function roundTrip(i: RoundTripInput): RoundTrip {
  const entryPool = i.entryMcap === null ? i.pool.now : i.pool.at(i.entryMcap);
  const entryMcap = mcapSol(entryPool, i.pool.supply);
  const buy = quoteTrade({ side: 'buy', amount: i.amount, rules: i.rules, reserves: entryPool, holdersOn: i.holdersOn });
  const empty = { ok: false, buy, sell: null, tokens: 0, back: 0, net: -i.amount, roi: -1, feesBuy: buy.totalFeesSol, feesSell: 0, impact: buy.impactSol, entryMcap, exitMcap: i.exitMcap };
  if (!buy.ok || buy.received <= 0) return empty;
  const sell = quoteTrade({
    side: 'sell',
    amount: buy.received,
    rules: i.rules,
    reserves: i.pool.at(i.exitMcap),
    holdersOn: i.holdersOn,
    halfLifeAgeSecs: i.halfLifeHours === null ? null : i.halfLifeHours * 3_600,
  });
  if (!sell.ok) return { ...empty, sell, tokens: buy.received };
  const net = sell.received - i.amount;
  return {
    ok: true,
    buy,
    sell,
    tokens: buy.received,
    back: sell.received,
    net,
    roi: i.amount > 0 ? net / i.amount : 0,
    feesBuy: buy.totalFeesSol,
    feesSell: sell.totalFeesSol,
    impact: buy.impactSol + sell.impactSol,
    entryMcap,
    exitMcap: i.exitMcap,
  };
}

/** The exit market cap, in SOL, at which the round trip gets the SOL back; null past 10,000×. */
export function breakEvenMcap(i: Omit<RoundTripInput, 'exitMcap'>): number | null {
  const entryPool = i.entryMcap === null ? i.pool.now : i.pool.at(i.entryMcap);
  const lo0 = mcapSol(entryPool, i.pool.supply);
  const back = (m: number) => roundTrip({ ...i, exitMcap: m }).back;
  let lo = lo0 * 0.5;
  let hi = lo0 * 1.01;
  while (back(hi) < i.amount) {
    lo = hi;
    hi *= 2;
    if (hi > lo0 * 10_000) return null;
  }
  for (let n = 0; n < 60; n++) {
    const mid = (lo + hi) / 2;
    if (back(mid) >= i.amount) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface GraduationInfo {
  /** Market cap at graduation, in SOL. */
  mcap: number;
  /** SOL that has to go into the curve, all told. */
  raise: number;
  /** SOL of buys still needed from the entry point. */
  left: number;
}

export function graduationInfo(pool: PoolModel, entryMcap: number | null): GraduationInfo | null {
  if (!pool.curve) return null;
  const entry = entryMcap === null ? pool.now : pool.at(entryMcap);
  return { mcap: graduationMcapSol(pool.curve), raise: Number(pool.curve.graduationQuote) / LAMPORTS, left: solToGraduate(entry, pool.curve) };
}
