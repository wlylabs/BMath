/**
 * Bordrless launch-pool math, ported from the public SDK
 * (github.com/BordrlessDex/bordrless-sdk, packages/shared/src/policy.ts, Apache-2.0) so the
 * numbers here match what the programs charge, lamport for lamport. Integer math runs in
 * bigint with the programs' rounding; the helpers at the bottom wrap it in plain numbers for
 * the calculators. bordrless.test.ts replays the SDK's own swap vectors against it.
 */

export type Side = 'buy' | 'sell';

export const BPS = 10_000n;
/** Lamports per SOL; bridged SOL has 9 decimals. */
export const LAMPORTS = 1_000_000_000;
/** Decimals of a launched token. */
export const TOKEN_DECIMALS = 6;
/** Every launch mints one billion tokens. */
export const TOKEN_SUPPLY = 1_000_000_000n * 1_000_000n;
/** 75% of the supply is sold on the curve; the rest is kept for graduation. */
export const CURVE_BPS = 7_500n;
/** The launch pool's LP fee outside the sniper window. */
export const LP_FEE_BPS = 30;
/** Flat protocol fee of an ordinary (non-launch) DEX pool, on the quote side. */
export const PROTOCOL_FEE_BPS = 100;
/** Bordrless takes a quarter of what a launch's rules collect (creator fee and holder rewards). */
export const LAUNCH_PROTOCOL_SHARE_BPS = 2_500;
/** The largest creator fee a launch may pick. */
export const MAX_CREATOR_FEE_BPS = 200;
/** Seconds after launch during which the LP fee is raised against snipers. */
export const SNIPER_WINDOW_SECS = 30;
/** The LP fee at second zero, falling linearly to LP_FEE_BPS. */
export const SNIPER_START_BPS = 8_000;
/** Paid by the creator at launch. */
export const LAUNCH_FEE_SOL = 0.01;
/** The dollar market cap every launch opens at. */
export const OPENING_MCAP_USD = 5_000;
/** Bounds of the virtual SOL reserve a launch may open with, in lamports. */
export const MIN_VIRTUAL_QUOTE = 1_000_000_000n;
export const MAX_VIRTUAL_QUOTE = 10_000_000_000_000n;
/** Holder rewards are paid only while holders hold at least a thousandth of the supply. */
export const MIN_ELIGIBLE = TOKEN_SUPPLY / 1_000n;
/** Policy caps on token rules, per side. */
export const RULE_BOUNDS = { maxHolderFeeBps: 200, maxBurnBps: 100, maxRulesFeeBps: 300 } as const;
/** Half-Life: the exit fee starts at 20% and halves every six hours held, gone after two days. */
export const HALF_LIFE_MAX_PPM = 200_000;
export const HALF_LIFE_SECS = 21_600;
export const HALF_LIFE_ZERO_AFTER = 8;
/** What a companion pays whoever sends one of its steps, as a share of what the step moves. */
export const COMPANION_BOUNTY_BPS = 50;

export function mulDivFloor(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError('division by zero');
  return (a * b) / d;
}

export function mulDivCeil(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError('division by zero');
  const p = a * b;
  return p % d === 0n ? p / d : p / d + 1n;
}

/** A fee of `bps` on `amount`, rounded up. */
export function feeAmount(amount: bigint, bps: number | bigint): bigint {
  return mulDivCeil(amount, BigInt(bps), BPS);
}

/** Bordrless's share of what the hooks cut, rounded up. */
export function protocolShare(value: bigint, shareBps: number): bigint {
  return feeAmount(value, shareBps);
}

// ---------------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------------

/** The fee-bearing token rules of a launch. Locks and max wallet move no money, so they are left out. */
export interface Rules {
  creatorFeeBps: number;
  holderFeeBuyBps: number;
  holderFeeSellBps: number;
  burnBuyBps: number;
  burnSellBps: number;
}

export const NO_RULES: Readonly<Rules> = { creatorFeeBps: 0, holderFeeBuyBps: 0, holderFeeSellBps: 0, burnBuyBps: 0, burnSellBps: 0 };

export type PresetId = 'plain' | 'diamond-hands' | 'burn' | 'paid-to-hold';

/** The launch form's presets, as the SDK lists them (RULE_PRESETS). */
export const PRESETS: readonly { id: PresetId; name: string; rules: Rules }[] = [
  { id: 'plain', name: 'Plain', rules: { ...NO_RULES, creatorFeeBps: 100 } },
  { id: 'diamond-hands', name: 'Diamond hands', rules: { ...NO_RULES, creatorFeeBps: 50, holderFeeBuyBps: 100, holderFeeSellBps: 100 } },
  { id: 'burn', name: 'Burn', rules: { creatorFeeBps: 50, holderFeeBuyBps: 50, holderFeeSellBps: 50, burnBuyBps: 50, burnSellBps: 50 } },
  { id: 'paid-to-hold', name: 'Paid to hold', rules: { ...NO_RULES, creatorFeeBps: 50, holderFeeSellBps: 200 } },
];

export function presetRules(id: PresetId): Rules {
  return (PRESETS.find((p) => p.id === id) ?? PRESETS[0]!).rules;
}

/** The preset these rules match exactly, if any. */
export function presetOf(r: Rules): PresetId | null {
  return PRESETS.find((p) => (Object.keys(r) as (keyof Rules)[]).every((k) => p.rules[k] === r[k]))?.id ?? null;
}

/** Why these rules could not launch under the policy, or null when they could. */
export function rulesProblem(r: Rules): 'creator' | 'holders' | 'burn' | 'total' | null {
  if (r.creatorFeeBps > MAX_CREATOR_FEE_BPS) return 'creator';
  if (r.holderFeeBuyBps > RULE_BOUNDS.maxHolderFeeBps || r.holderFeeSellBps > RULE_BOUNDS.maxHolderFeeBps) return 'holders';
  if (r.burnBuyBps > RULE_BOUNDS.maxBurnBps || r.burnSellBps > RULE_BOUNDS.maxBurnBps) return 'burn';
  const buy = r.creatorFeeBps + r.holderFeeBuyBps + r.burnBuyBps;
  const sell = r.creatorFeeBps + r.holderFeeSellBps + r.burnSellBps;
  if (Math.max(buy, sell) > RULE_BOUNDS.maxRulesFeeBps) return 'total';
  return null;
}

// ---------------------------------------------------------------------------------------------
// One swap on a launch pool (SDK quoteLaunchSwap)
// ---------------------------------------------------------------------------------------------

export interface Reserves {
  baseReserve: bigint;
  quoteReserve: bigint;
  virtualBase: bigint;
  virtualQuote: bigint;
}

export interface LaunchFeeParams extends Rules {
  /** Tokens held by holders who can earn rewards, before the trade. */
  eligible: bigint;
  /** Rewards are paid only from this many eligible tokens up. */
  minEligible: bigint;
}

export interface HookCut {
  creatorFee: bigint;
  holderFee: bigint;
  burn: bigint;
}

export function creatorAndHolderFees(amount: bigint, creatorFeeBps: number, holderFeeBps: number, eligible: bigint, minEligible: bigint): { creatorFee: bigint; holderFee: bigint } {
  const creatorFee = feeAmount(amount, creatorFeeBps);
  const holderFee = holderFeeBps > 0 && eligible >= minEligible ? feeAmount(amount, holderFeeBps) : 0n;
  if (creatorFee + holderFee >= amount) return { creatorFee: 0n, holderFee: 0n };
  return { creatorFee, holderFee };
}

export function tradeBurn(amount: bigint, burnBps: number): bigint {
  const burn = mulDivFloor(amount, BigInt(burnBps), BPS);
  return burn < amount ? burn : 0n;
}

function beforeSwap(side: Side, amountIn: bigint, p: LaunchFeeParams): HookCut {
  if (side === 'buy') return { ...creatorAndHolderFees(amountIn, p.creatorFeeBps, p.holderFeeBuyBps, p.eligible, p.minEligible), burn: 0n };
  return { creatorFee: 0n, holderFee: 0n, burn: tradeBurn(amountIn, p.burnSellBps) };
}

function afterSwap(side: Side, amountOut: bigint, p: LaunchFeeParams): HookCut {
  if (side === 'buy') return { creatorFee: 0n, holderFee: 0n, burn: tradeBurn(amountOut, p.burnBuyBps) };
  return { ...creatorAndHolderFees(amountOut, p.creatorFeeBps, p.holderFeeSellBps, p.eligible, p.minEligible), burn: 0n };
}

export type SwapFailure = 'fees_exceed_input' | 'no_output' | 'insufficient_liquidity';

export interface LaunchSwap {
  creatorFee: bigint;
  holderFee: bigint;
  burn: bigint;
  holderFeeOn: boolean;
  received: bigint;
  lpFee: bigint;
  protocolFee: bigint;
  netIn: bigint;
  amountOut: bigint | null;
  delivered: bigint | null;
  failure: SwapFailure | null;
}

/** The constant-product output for `netIn` going into the curve, before the check against the real reserve. */
export function curveOutput(r: Reserves, side: Side, netIn: bigint): bigint {
  if (netIn <= 0n) return 0n;
  return side === 'buy'
    ? mulDivFloor(netIn, r.baseReserve + r.virtualBase, r.quoteReserve + r.virtualQuote + netIn)
    : mulDivFloor(netIn, r.quoteReserve + r.virtualQuote, r.baseReserve + r.virtualBase + netIn);
}

/**
 * A swap on a launch pool in the DEX's order. A buy: creator and holder fees from the SOL in,
 * the LP fee and Bordrless's share on what reached the vault, the curve, then the burn from the
 * tokens out. A sell: the burn from the tokens in, the curve, the LP fee from the SOL out, then
 * the creator and holder fees and Bordrless's share from what is left.
 */
export function quoteLaunchSwap(r: Reserves, side: Side, amountIn: bigint, lpFeeBps: number, protocolShareBps: number, p: LaunchFeeParams): LaunchSwap {
  const before = beforeSwap(side, amountIn, p);
  const received = amountIn - before.creatorFee - before.holderFee - before.burn;
  const eligibleAtFees = side === 'sell' ? (p.eligible > amountIn ? p.eligible - amountIn : 0n) : p.eligible;
  const holderFeeOn = (side === 'buy' ? p.holderFeeBuyBps : p.holderFeeSellBps) > 0 && eligibleAtFees >= p.minEligible;
  const buyLpFee = side === 'buy' ? feeAmount(received, lpFeeBps) : 0n;
  const inputProtocolFee = side === 'buy' ? protocolShare(before.creatorFee + before.holderFee, protocolShareBps) : 0n;
  const netIn = received - buyLpFee - inputProtocolFee;
  const failed = (failure: SwapFailure, protocolFee = inputProtocolFee, carried: Partial<LaunchSwap> = {}): LaunchSwap => ({
    ...before,
    holderFeeOn,
    received,
    lpFee: buyLpFee,
    protocolFee,
    netIn,
    amountOut: null,
    delivered: null,
    failure,
    ...carried,
  });
  if (received <= 0n || netIn <= 0n) return failed('fees_exceed_input');
  const out = curveOutput(r, side, netIn);
  if (out <= 0n) return failed('no_output');
  if (out > (side === 'buy' ? r.baseReserve : r.quoteReserve)) return failed('insufficient_liquidity');
  if (side === 'buy') {
    const after = afterSwap('buy', out, p);
    return { ...before, burn: after.burn, holderFeeOn, received, lpFee: buyLpFee, protocolFee: inputProtocolFee, netIn, amountOut: out, delivered: out - after.burn, failure: null };
  }
  const lpFee = feeAmount(out, lpFeeBps);
  if (lpFee >= out) return failed('no_output', 0n, { lpFee });
  const told = out - lpFee;
  const after = afterSwap('sell', told, { ...p, eligible: eligibleAtFees });
  const protocolFee = protocolShare(after.creatorFee + after.holderFee, protocolShareBps);
  if (after.creatorFee + after.holderFee + protocolFee >= told) {
    return failed('no_output', protocolFee, { creatorFee: after.creatorFee, holderFee: after.holderFee, lpFee });
  }
  return {
    creatorFee: after.creatorFee,
    holderFee: after.holderFee,
    burn: before.burn,
    holderFeeOn,
    received,
    lpFee,
    protocolFee,
    netIn,
    amountOut: out,
    delivered: told - after.creatorFee - after.holderFee - protocolFee,
    failure: null,
  };
}

// ---------------------------------------------------------------------------------------------
// The headline fee of one side (§7.3) and the time-based fees
// ---------------------------------------------------------------------------------------------

/**
 * The total fee of one side as one figure, rounded up to a basis point:
 * buy `1 - (1 - (creator + holders)(1 + s))(1 - lp)(1 - burn)`,
 * sell `1 - (1 - burn)(1 - lp)(1 - (creator + holders)(1 + s))`.
 * Plain (creator 1%, LP 0.3%, s = 25%) is 155 bps, which bordrless.app shows as 1.6%.
 */
export function sideFeeBps(side: Side, f: { lpFeeBps: number; creatorFeeBps: number; holderFeeBps: number; burnBps: number; protocolShareBps?: number }): number {
  const share = BigInt(f.protocolShareBps ?? LAUNCH_PROTOCOL_SHARE_BPS);
  const cutsScaled = BigInt(f.creatorFeeBps + f.holderFeeBps) * (BPS + share);
  const factors: [bigint, bigint][] = [
    [BPS * BPS - cutsScaled, BPS * BPS],
    [BPS - BigInt(f.lpFeeBps), BPS],
    [BPS - BigInt(f.burnBps), BPS],
  ];
  let kept = 1n;
  let scale = 1n;
  for (const [n, d] of factors) {
    if (n < 0n) throw new RangeError('a fee is between 0 and 100%');
    kept *= n;
    scale *= d;
  }
  // multiplication commutes, so a sell's order (burn first) gives the same figure
  void side;
  return Number(mulDivCeil(scale - kept, BPS, scale));
}

/** Both sides' headline fee for a set of rules, with holder rewards flowing or not. */
export function headlineFees(r: Rules, lpFeeBps = LP_FEE_BPS, holdersOn = true): { buyBps: number; sellBps: number } {
  return {
    buyBps: sideFeeBps('buy', { lpFeeBps, creatorFeeBps: r.creatorFeeBps, holderFeeBps: holdersOn ? r.holderFeeBuyBps : 0, burnBps: r.burnBuyBps }),
    sellBps: sideFeeBps('sell', { lpFeeBps, creatorFeeBps: r.creatorFeeBps, holderFeeBps: holdersOn ? r.holderFeeSellBps : 0, burnBps: r.burnSellBps }),
  };
}

/** The LP fee `elapsed` seconds after launch: 80% at second zero, falling linearly to 0.3% at 30 s. */
export function sniperLpFeeBps(elapsed: number, windowSecs = SNIPER_WINDOW_SECS, startBps = SNIPER_START_BPS, baseBps = LP_FEE_BPS): number {
  if (windowSecs <= 0 || elapsed >= windowSecs || startBps <= baseBps) return baseBps;
  const span = startBps - baseBps;
  const fallen = Math.floor((span * Math.max(0, elapsed)) / windowSecs);
  return startBps - Math.min(span, fallen);
}

/** Half-Life's exit fee in parts per million for tokens held `ageSecs`: halves every 6 h, linear inside each, zero from 48 h. */
export function halfLifeFeePpm(ageSecs: number): number {
  if (ageSecs <= 0) return HALF_LIFE_MAX_PPM;
  const age = Math.floor(ageSecs);
  const halvings = Math.floor(age / HALF_LIFE_SECS);
  if (halvings >= HALF_LIFE_ZERO_AFTER) return 0;
  const into = age % HALF_LIFE_SECS;
  const hi = HALF_LIFE_MAX_PPM >> halvings;
  const lo = HALF_LIFE_MAX_PPM >> (halvings + 1);
  return hi - Math.floor(((hi - lo) * into) / HALF_LIFE_SECS);
}

// ---------------------------------------------------------------------------------------------
// The curve
// ---------------------------------------------------------------------------------------------

export interface CurveParams {
  curveTokens: bigint;
  reserveTokens: bigint;
  virtualQuote: bigint;
  virtualBase: bigint;
  graduationQuote: bigint;
}

/** The curve of a launch from the supply, the curve share and the virtual SOL it opens with. */
export function curveParams(virtualQuote: bigint, supply = TOKEN_SUPPLY, curveBps = CURVE_BPS): CurveParams {
  const c = mulDivFloor(supply, curveBps, BPS);
  const r = supply - c;
  const diff = c - r;
  return { curveTokens: c, reserveTokens: r, virtualQuote, virtualBase: mulDivFloor(c, r, diff), graduationQuote: mulDivFloor(virtualQuote, diff, r) };
}

/** The virtual SOL that opens a curve at $5k for this SOL price, clamped like the backend does. */
export function virtualQuoteForSolPrice(solUsd: number, mcapUsd = OPENING_MCAP_USD): bigint {
  if (!(solUsd > 0)) throw new RangeError('SOL has no price');
  const mcapLamports = BigInt(Math.round((mcapUsd / solUsd) * LAMPORTS));
  const shape = curveParams(1n);
  const vq = mulDivCeil(mcapLamports, shape.curveTokens + shape.virtualBase, TOKEN_SUPPLY);
  return vq < MIN_VIRTUAL_QUOTE ? MIN_VIRTUAL_QUOTE : vq > MAX_VIRTUAL_QUOTE ? MAX_VIRTUAL_QUOTE : vq;
}

/** Reserves of a brand-new launch. */
export function openingReserves(p: CurveParams): Reserves {
  return { baseReserve: p.curveTokens, quoteReserve: 0n, virtualBase: p.virtualBase, virtualQuote: p.virtualQuote };
}

/** Market cap in SOL at these reserves (spot price times the supply). */
export function mcapSol(r: Reserves, supply = TOKEN_SUPPLY): number {
  const q = Number(r.quoteReserve + r.virtualQuote);
  const b = Number(r.baseReserve + r.virtualBase);
  if (b <= 0) return 0;
  return ((q / b) * Number(supply)) / LAMPORTS;
}

/** How far along the curve a launch is, 0 to 1. */
export function curveProgress(r: Reserves, p: CurveParams): number {
  if (p.graduationQuote <= 0n) return 1;
  return Math.min(1, Math.max(0, Number(r.quoteReserve) / Number(p.graduationQuote)));
}

/** The market cap a curve graduates at, in SOL: nine times where it opened. */
export function graduationMcapSol(p: CurveParams): number {
  const k = Number(p.virtualQuote) * Number(p.curveTokens + p.virtualBase);
  const q = Number(p.graduationQuote + p.virtualQuote);
  return ((q * q) / k) * (Number(TOKEN_SUPPLY) / LAMPORTS);
}

/**
 * The pool at a given market cap, for what-if quotes on a launch that does not exist yet. On the
 * curve (up to graduation) it is the curve itself; above it, the graduated pool, which carries on
 * from the graduation reserves without the virtual offsets.
 */
export function reservesAtMcap(mcap: number, p: CurveParams): Reserves {
  const S = Number(TOKEN_SUPPLY);
  const vq = Number(p.virtualQuote);
  const k = vq * Number(p.curveTokens + p.virtualBase);
  const gradMcap = graduationMcapSol(p);
  const target = Math.max(mcap, mcapSol(openingReserves(p)));
  if (target <= gradMcap) {
    const q = Math.sqrt((target * LAMPORTS * k) / S);
    const quoteReserve = BigInt(Math.max(0, Math.round(q - vq)));
    const base = BigInt(Math.floor(k / Number(quoteReserve + p.virtualQuote))) - p.virtualBase;
    return { baseReserve: base > 0n ? base : 0n, quoteReserve, virtualBase: p.virtualBase, virtualQuote: p.virtualQuote };
  }
  // graduated: real reserves only, priced continuously from the graduation point
  const gq = Number(p.graduationQuote);
  const gPrice = (gradMcap * LAMPORTS) / S;
  const k2 = gq * (gq / gPrice);
  const price = (target * LAMPORTS) / S;
  const quote = Math.sqrt(k2 * price);
  return { baseReserve: BigInt(Math.round(quote / price)), quoteReserve: BigInt(Math.round(quote)), virtualBase: 0n, virtualQuote: 0n };
}

// ---------------------------------------------------------------------------------------------
// Plain-number wrappers for the calculators
// ---------------------------------------------------------------------------------------------

export function toLamports(sol: number): bigint {
  return BigInt(Math.max(0, Math.round(sol * LAMPORTS)));
}

export function fromLamports(l: bigint): number {
  return Number(l) / LAMPORTS;
}

export function toBaseUnits(tokens: number): bigint {
  return BigInt(Math.max(0, Math.round(tokens * 10 ** TOKEN_DECIMALS)));
}

export function fromBaseUnits(b: bigint): number {
  return Number(b) / 10 ** TOKEN_DECIMALS;
}

export interface TradeInput {
  side: Side;
  /** SOL in for a buy, tokens in for a sell. */
  amount: number;
  rules: Rules;
  reserves: Reserves;
  /** Seconds after launch; 30 or more is the normal LP fee. */
  elapsed?: number;
  /** Holder rewards are flowing (holders hold at least 0.1% of the supply). */
  holdersOn?: boolean;
  /** Half-Life tokens held this long pay its exit fee on a sell. */
  halfLifeAgeSecs?: number | null;
  /** The creator's own first buy pays the normal LP fee inside the sniper window. */
  creatorFirstBuy?: boolean;
}

export interface TradeResult {
  side: Side;
  ok: boolean;
  failure: SwapFailure | null;
  /** What the trader puts in, in SOL (buy) or tokens (sell). */
  amountIn: number;
  /** What reaches the trader, in tokens (buy) or SOL (sell). */
  received: number;
  lpFeeBps: number;
  /** Fees in SOL. */
  creatorFee: number;
  holderFee: number;
  lpFee: number;
  protocolFee: number;
  /** Tokens burned by the burn rule. */
  burnTokens: number;
  /** The burn valued in SOL at the spot price. */
  burnSol: number;
  /** Half-Life exit fee in tokens, and valued in SOL. */
  halfLifeTokens: number;
  halfLifeSol: number;
  /** Every fee in SOL. */
  totalFeesSol: number;
  /** Price movement of the curve itself, fees excluded, in SOL. */
  impactSol: number;
  /** Fees as a share of the trade's value at spot. */
  feeRate: number;
  impactRate: number;
  /** Value of the trade at the spot price before it, in SOL. */
  valueSol: number;
  /** Spot price before the trade, SOL per token. */
  spotPrice: number;
  /** Average price paid or got, SOL per token, everything included. */
  avgPrice: number;
}

/** Spot price in SOL per whole token. */
export function spotPrice(r: Reserves): number {
  const q = Number(r.quoteReserve + r.virtualQuote) / LAMPORTS;
  const b = Number(r.baseReserve + r.virtualBase) / 10 ** TOKEN_DECIMALS;
  return b > 0 ? q / b : 0;
}

/** One trade on a launch pool, in SOL and whole tokens. */
export function quoteTrade(input: TradeInput): TradeResult {
  const { side, rules, reserves } = input;
  const lpFeeBps = input.creatorFirstBuy && side === 'buy' ? LP_FEE_BPS : sniperLpFeeBps(input.elapsed ?? SNIPER_WINDOW_SECS);
  const holdersOn = input.holdersOn ?? true;
  const params: LaunchFeeParams = { ...rules, eligible: holdersOn ? TOKEN_SUPPLY : 0n, minEligible: MIN_ELIGIBLE };
  const price = spotPrice(reserves);

  // Half-Life takes its fee from the tokens being sold, before they move, into the furnace
  const hlPpm = side === 'sell' && input.halfLifeAgeSecs != null ? halfLifeFeePpm(input.halfLifeAgeSecs) : 0;
  const rawIn = side === 'buy' ? toLamports(input.amount) : toBaseUnits(input.amount);
  const hlCut = hlPpm > 0 ? (rawIn * BigInt(hlPpm)) / 1_000_000n : 0n;
  const swapIn = rawIn - hlCut;

  const q = quoteLaunchSwap(reserves, side, swapIn, lpFeeBps, LAUNCH_PROTOCOL_SHARE_BPS, params);
  const ok = q.failure === null && q.delivered !== null;
  const creatorFee = fromLamports(q.creatorFee);
  const holderFee = fromLamports(q.holderFee);
  const lpFee = fromLamports(q.lpFee);
  const protocolFee = fromLamports(q.protocolFee);
  const burnTokens = fromBaseUnits(q.burn);
  const halfLifeTokens = fromBaseUnits(hlCut);

  const valueSol = side === 'buy' ? input.amount : input.amount * price;
  const burnSol = burnTokens * price;
  const halfLifeSol = halfLifeTokens * price;
  const feesSol = creatorFee + holderFee + lpFee + protocolFee + burnSol + halfLifeSol;
  const received = ok ? (side === 'buy' ? fromBaseUnits(q.delivered!) : fromLamports(q.delivered!)) : 0;

  // whatever is neither a fee nor delivered is the curve's own price movement
  const deliveredSol = side === 'buy' ? received * price : received;
  const impactSol = ok ? Math.max(0, valueSol - feesSol - deliveredSol) : 0;
  const avgPrice = ok ? (side === 'buy' ? (received > 0 ? input.amount / received : 0) : input.amount > 0 ? received / input.amount : 0) : 0;

  return {
    side,
    ok,
    failure: q.failure,
    amountIn: input.amount,
    received,
    lpFeeBps,
    creatorFee,
    holderFee,
    lpFee,
    protocolFee,
    burnTokens,
    burnSol,
    halfLifeTokens,
    halfLifeSol,
    totalFeesSol: feesSol,
    impactSol,
    feeRate: valueSol > 0 ? feesSol / valueSol : 0,
    impactRate: valueSol > 0 ? impactSol / valueSol : 0,
    valueSol,
    spotPrice: price,
    avgPrice,
  };
}

/** Moves a pool by a landed swap, for chaining a buy and a later sell on the same pool. */
export function applySwap(r: Reserves, side: Side, input: TradeInput): Reserves {
  const params: LaunchFeeParams = { ...input.rules, eligible: (input.holdersOn ?? true) ? TOKEN_SUPPLY : 0n, minEligible: MIN_ELIGIBLE };
  const lp = sniperLpFeeBps(input.elapsed ?? SNIPER_WINDOW_SECS);
  const raw = side === 'buy' ? toLamports(input.amount) : toBaseUnits(input.amount);
  const q = quoteLaunchSwap(r, side, raw, lp, LAUNCH_PROTOCOL_SHARE_BPS, params);
  if (q.failure || q.amountOut === null) return r;
  return side === 'buy'
    ? { ...r, quoteReserve: r.quoteReserve + q.netIn, baseReserve: r.baseReserve - q.amountOut }
    : { ...r, baseReserve: r.baseReserve + q.received, quoteReserve: r.quoteReserve - q.amountOut };
}

/** The SOL a buyer must put in to move the curve from these reserves to graduation. */
export function solToGraduate(r: Reserves, p: CurveParams): number {
  const left = p.graduationQuote - r.quoteReserve;
  return left > 0n ? fromLamports(left) : 0;
}

// ---------------------------------------------------------------------------------------------
// Creator and holder earnings
// ---------------------------------------------------------------------------------------------

export type CompanionId = 'none' | 'buys-itself' | 'rug-proof-dev' | 'buyback-reward';

/** How a companion splits each creator fee: bought back and burned, paid to holders, paid to the launcher. */
export const COMPANIONS: Readonly<Record<CompanionId, { buyback: number; holders: number; launcher: number }>> = {
  none: { buyback: 0, holders: 0, launcher: 1 },
  'buys-itself': { buyback: 1, holders: 0, launcher: 0 },
  'rug-proof-dev': { buyback: 0, holders: 0.5, launcher: 0.5 },
  'buyback-reward': { buyback: 0.5, holders: 0.5, launcher: 0 },
};

export interface EarnInput {
  /** Trading volume per day, in SOL. */
  volumeSol: number;
  /** Share of that volume that is buys, 0 to 1. */
  buyShare: number;
  rules: Rules;
  /** Your share of the tokens eligible for holder rewards, 0 to 1. */
  holdingShare: number;
  companion: CompanionId;
}

export interface EarnResult {
  creatorFees: number;
  toLauncher: number;
  toBuyback: number;
  /** Holder rewards from the rule, plus a companion's holder share. */
  toHolders: number;
  /** Your part of what holders receive. */
  yours: number;
  /** What Bordrless takes: a quarter of the cuts, plus the LP fee. */
  protocol: number;
  lpFee: number;
  /** The burn rules, valued in SOL. */
  burned: number;
  /** Every fee traders pay, in SOL. */
  tradersPay: number;
}

/**
 * Daily money flows for a launch from its volume. Fees are taken as rates of the SOL side of
 * each trade, which is how the hook charges them (a buy's SOL in, a sell's SOL out).
 */
export function earnings(e: EarnInput): EarnResult {
  const v = Math.max(0, e.volumeSol);
  const buy = v * Math.min(1, Math.max(0, e.buyShare));
  const sell = v - buy;
  const r = e.rules;
  const creatorFees = (v * r.creatorFeeBps) / 10_000;
  const holderRule = (buy * r.holderFeeBuyBps + sell * r.holderFeeSellBps) / 10_000;
  const split = COMPANIONS[e.companion];
  const toBuyback = creatorFees * split.buyback;
  const toLauncher = creatorFees * split.launcher;
  const toHolders = holderRule + creatorFees * split.holders;
  const lpFee = (v * LP_FEE_BPS) / 10_000;
  const protocol = ((creatorFees + holderRule) * LAUNCH_PROTOCOL_SHARE_BPS) / 10_000 + lpFee;
  const burned = (buy * r.burnBuyBps + sell * r.burnSellBps) / 10_000;
  return {
    creatorFees,
    toLauncher,
    toBuyback,
    toHolders,
    yours: toHolders * Math.min(1, Math.max(0, e.holdingShare)),
    protocol,
    lpFee,
    burned,
    tradersPay: creatorFees + holderRule + protocol + burned,
  };
}
