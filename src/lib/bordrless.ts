/**
 * Bordrless launch-pool math. The integer core comes straight from the official
 * `@bordrless/shared` package (github.com/BordrlessDex/bordrless-sdk, Apache-2.0), which mirrors
 * the programs' `crates/bordrless-core` bit for bit; this file adds what the package leaves out
 * (a token hook's cut on a sell, such as Half-Life's exit fee) and plain-number wrappers for the
 * calculators. bordrless.test.ts replays the 440 swap vectors the programs' tests publish.
 */
import {
  BPS,
  CURVE_BPS,
  curveOutput,
  curveParams as sharedCurveParams,
  HALF_LIFE,
  halfLifeFeePpm,
  LAUNCH_FEE_LAMPORTS,
  LAUNCH_PROTOCOL_SHARE_BPS,
  launchAfterSwap,
  launchBeforeSwap,
  LP_FEE_BPS,
  MAX_CREATOR_FEE_BPS,
  MAX_VIRTUAL_QUOTE,
  MIN_VIRTUAL_QUOTE,
  OPENING_MCAP_USD,
  feeAmount,
  protocolShare,
  quoteLaunchSwap,
  quoteValue,
  RULE_BOUNDS,
  RULE_PRESETS,
  sideFeeBps,
  sniperLpFee,
  SNIPER_START_BPS,
  SNIPER_WINDOW_SECS,
  TOKEN_DECIMALS,
  TOKEN_SUPPLY,
  virtualQuoteForUsd,
  type LaunchFeeParams,
  type LaunchSwap,
  type Reserves,
} from '@bordrless/shared';

export {
  BPS,
  CURVE_BPS,
  curveOutput,
  feeAmount,
  HALF_LIFE,
  halfLifeFeePpm,
  LAUNCH_PROTOCOL_SHARE_BPS,
  LP_FEE_BPS,
  MAX_CREATOR_FEE_BPS,
  MAX_VIRTUAL_QUOTE,
  MIN_VIRTUAL_QUOTE,
  OPENING_MCAP_USD,
  protocolShare,
  quoteLaunchSwap,
  quoteValue,
  RULE_BOUNDS,
  sideFeeBps,
  SNIPER_START_BPS,
  SNIPER_WINDOW_SECS,
  TOKEN_DECIMALS,
  TOKEN_SUPPLY,
};
export type { LaunchFeeParams, LaunchSwap, Reserves };

export type Side = 'buy' | 'sell';
export type SwapFailure = NonNullable<LaunchSwap['failure']>;

/** Lamports per SOL; bridged SOL has 9 decimals. */
export const LAMPORTS = 1_000_000_000;
/** Paid by the creator at launch, in SOL. */
export const LAUNCH_FEE_SOL = Number(LAUNCH_FEE_LAMPORTS) / LAMPORTS;
/** Holder rewards are paid only while holders hold at least a thousandth of the supply (the kit's `min_eligible`). */
export const MIN_ELIGIBLE = TOKEN_SUPPLY / 1_000n;
/** What a companion pays whoever sends one of its steps, as a share of what the step moves (docs/companions.md). */
export const COMPANION_BOUNTY_BPS = 50;
/** Parts per million, Half-Life's unit. */
const PPM = 1_000_000n;

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

/** The launch form's presets, read from the package's RULE_PRESETS (only the fields that move money). */
export const PRESETS: readonly { id: PresetId; name: string; rules: Rules }[] = RULE_PRESETS.map((p) => ({
  id: p.slug as PresetId,
  name: p.name,
  rules: {
    creatorFeeBps: p.creatorFeeBps,
    holderFeeBuyBps: p.rules.holderFeeBuyBps,
    holderFeeSellBps: p.rules.holderFeeSellBps,
    burnBuyBps: p.rules.burnBuyBps,
    burnSellBps: p.rules.burnSellBps,
  },
}));

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
// A sell with a token hook's cut (Half-Life), which quoteLaunchSwap leaves out
// ---------------------------------------------------------------------------------------------

export interface LaunchSell extends LaunchSwap {
  /** What the token hook took from the tokens on their way into the pool (Half-Life: to the furnace). */
  tokenCut: bigint;
  /** That cut's value in SOL at the swap's own price, which Bordrless takes its share of. */
  tokenCutValue: bigint;
  /** Bordrless's share of the token cut's value, in SOL (part of protocolFee). */
  tokenCutShare: bigint;
}

/**
 * A sell on a launch pool whose token hook cuts `tokenCut` from the transfer into the pool, in the
 * order of programs/bordrless_swap/src/instructions/swap.rs: the launch's burn from the tokens in,
 * the token hook's cut from the transfer (so the pool receives what is left), the curve, then
 * `swap_amounts_shared` (crates/bordrless-core): the LP fee and Bordrless's share of the cut's
 * value (`quote_value(cut, out_gross, net_in)`) leave the curve's output; the launchpad's
 * `after_swap` takes the creator and holder fees from what remains, and Bordrless's share of those
 * is held back from the delivery. With `tokenCut` 0 this is exactly quoteLaunchSwap.
 */
export function quoteLaunchSell(r: Reserves, amountIn: bigint, tokenCut: (transferred: bigint) => bigint, lpFeeBps: number, protocolShareBps: number, p: LaunchFeeParams): LaunchSell {
  const before = launchBeforeSwap('sell', amountIn, p);
  const transferred = amountIn - before.burn;
  const cut = transferred > 0n ? tokenCut(transferred) : 0n;
  const received = transferred - cut;
  const eligibleAtFees = p.eligible > amountIn ? p.eligible - amountIn : 0n;
  const holderFeeOn = p.holderFeeSellBps > 0 && eligibleAtFees >= p.minEligible;
  const base: LaunchSell = {
    creatorFee: 0n,
    holderFee: 0n,
    burn: before.burn,
    holderFeeOn,
    received,
    lpFee: 0n,
    protocolFee: 0n,
    netIn: received,
    amountOut: null,
    delivered: null,
    failure: null,
    tokenCut: cut,
    tokenCutValue: 0n,
    tokenCutShare: 0n,
  };
  if (received <= 0n) return { ...base, failure: 'fees_exceed_input' };
  const out = curveOutput(r, 'sell', received);
  if (out <= 0n) return { ...base, failure: 'no_output' };
  if (out > r.quoteReserve) return { ...base, failure: 'insufficient_liquidity' };
  return { ...base, ...sellAfterCurve(out, received, cut, lpFeeBps, protocolShareBps, { ...p, eligible: eligibleAtFees }) };
}

/**
 * The rest of a launch-pool sell once the curve has given `out` lamports for the `received`
 * tokens that reached the pool, `cut` of them having gone to a token hook: `swap_amounts_shared`
 * (crates/bordrless-core/src/lib.rs) takes the LP fee and Bordrless's share of the cut's value from
 * `out`; the launchpad's after_swap takes the creator and holder fees from what is left; the DEX
 * holds back Bordrless's share of those (programs/bordrless_swap/src/instructions/swap.rs).
 * `p.eligible` is the count once the seller's tokens have left.
 */
export function sellAfterCurve(out: bigint, received: bigint, cut: bigint, lpFeeBps: number, protocolShareBps: number, p: LaunchFeeParams) {
  const lpFee = feeAmount(out, lpFeeBps);
  const tokenCutValue = quoteValue(cut, out, received);
  const tokenCutShare = protocolShare(tokenCutValue, protocolShareBps);
  const none = { creatorFee: 0n, holderFee: 0n, lpFee, protocolFee: tokenCutShare, amountOut: out, tokenCutValue, tokenCutShare, delivered: null };
  if (lpFee + tokenCutShare >= out) return { ...none, failure: 'no_output' as const };
  const told = out - lpFee - tokenCutShare;
  const after = launchAfterSwap('sell', told, p);
  const heldBack = protocolShare(after.creatorFee + after.holderFee, protocolShareBps);
  const done = { ...none, creatorFee: after.creatorFee, holderFee: after.holderFee, protocolFee: tokenCutShare + heldBack };
  if (after.creatorFee + after.holderFee + heldBack >= told) return { ...done, failure: 'no_output' as const };
  return { ...done, delivered: told - after.creatorFee - after.holderFee - heldBack, failure: null };
}

/** Half-Life's exit fee on `amount` tokens held `ageSecs`: the program's `fee_on`, rounded down. Unstamped tokens (age unknown) pay the full 20%. */
export function halfLifeCut(amount: bigint, ageSecs: number | null): bigint {
  const ppm = BigInt(ageSecs === null ? HALF_LIFE.maxFeePpm : halfLifeFeePpm(ageSecs));
  const fee = (amount * ppm) / PPM;
  return fee < amount ? fee : amount;
}

/**
 * Half-Life's `blend` (programs/half_life/src/lib.rs): the arrival time of a holding of `balance`
 * tokens that arrived at `since` once `added` tokens that arrived at `addedSince` join it, the
 * average by weight, truncated toward zero like the program's integer division; an empty holding
 * takes the new tokens' time. Bought tokens arrive "now"; sent tokens keep the sender's time.
 */
export function halfLifeBlend(balance: bigint, since: bigint, added: bigint, addedSince: bigint): bigint {
  if (balance === 0n) return addedSince;
  return (balance * since + added * addedSince) / (balance + added);
}

// ---------------------------------------------------------------------------------------------
// The headline fee of one side (§7.3) and the time-based fees
// ---------------------------------------------------------------------------------------------

/** Both sides' headline fee for a set of rules, as bordrless.app computes it (`sideFeeBps` with a 25% share). */
export function headlineFees(r: Rules, lpFeeBps = LP_FEE_BPS, holdersOn = true): { buyBps: number; sellBps: number } {
  const share = LAUNCH_PROTOCOL_SHARE_BPS;
  return {
    buyBps: sideFeeBps('buy', { lpFeeBps, creatorFeeBps: r.creatorFeeBps, holderFeeBps: holdersOn ? r.holderFeeBuyBps : 0, burnBps: r.burnBuyBps, protocolShareBps: share }),
    sellBps: sideFeeBps('sell', { lpFeeBps, creatorFeeBps: r.creatorFeeBps, holderFeeBps: holdersOn ? r.holderFeeSellBps : 0, burnBps: r.burnSellBps, protocolShareBps: share }),
  };
}

/** The LP fee `elapsed` seconds after launch (the package's `sniperLpFee` with the launch policy's window). */
export function sniperLpFeeBps(elapsed: number, windowSecs = SNIPER_WINDOW_SECS, startBps = SNIPER_START_BPS, baseBps = LP_FEE_BPS): number {
  return sniperLpFee(Math.max(0, elapsed), 0, windowSecs, startBps, baseBps);
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

/** The curve of a launch that opens with `virtualQuote` lamports of virtual SOL. */
export function curveParams(virtualQuote: bigint, supply = TOKEN_SUPPLY, curveBps = CURVE_BPS): CurveParams {
  const p = sharedCurveParams(supply, curveBps, virtualQuote);
  if (!p) throw new RangeError('no curve for these parameters');
  return p;
}

/** The virtual SOL that opens a curve at $5k for this SOL price, clamped like the backend does. */
export function virtualQuoteForSolPrice(solUsd: number, mcapUsd = OPENING_MCAP_USD): bigint {
  return virtualQuoteForUsd(solUsd, 9, mcapUsd);
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
  /** Bordrless's share of the Half-Life cut's value, in SOL; included in protocolFee. */
  halfLifeShare: number;
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

  const rawIn = side === 'buy' ? toLamports(input.amount) : toBaseUnits(input.amount);
  const halfLife = side === 'sell' && input.halfLifeAgeSecs !== undefined && input.halfLifeAgeSecs !== null;
  // Half-Life cuts its exit fee from the transfer into the pool; the DEX then takes its share of that cut's value
  const q: LaunchSwap & Partial<LaunchSell> = halfLife
    ? quoteLaunchSell(reserves, rawIn, (moved) => halfLifeCut(moved, input.halfLifeAgeSecs!), lpFeeBps, LAUNCH_PROTOCOL_SHARE_BPS, params)
    : quoteLaunchSwap(reserves, side, rawIn, lpFeeBps, LAUNCH_PROTOCOL_SHARE_BPS, params);
  const ok = q.failure === null && q.delivered !== null;
  const creatorFee = fromLamports(q.creatorFee);
  const holderFee = fromLamports(q.holderFee);
  const lpFee = fromLamports(q.lpFee);
  const protocolFee = fromLamports(q.protocolFee);
  const halfLifeShare = fromLamports(q.tokenCutShare ?? 0n);
  const burnTokens = fromBaseUnits(q.burn);
  const halfLifeTokens = fromBaseUnits(q.tokenCut ?? 0n);

  const valueSol = side === 'buy' ? input.amount : input.amount * price;
  const burnSol = burnTokens * price;
  // valued at the swap's own price, as the DEX values it for its share; spot until the swap lands
  const halfLifeSol = q.tokenCutValue ? fromLamports(q.tokenCutValue) : halfLifeTokens * price;
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
    halfLifeShare,
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
  /** A live launch's own split, read from its companion; it wins over the template. */
  split?: { buyback: number; holders: number; launcher: number } | null;
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
  const split = e.split ?? COMPANIONS[e.companion];
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
