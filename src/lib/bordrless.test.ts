import { describe, expect, it } from 'vitest';
import vectors from './vectors/launch-swaps.json';
import {
  curveParams,
  earnings,
  graduationMcapSol,
  halfLifeFeePpm,
  headlineFees,
  LP_FEE_BPS,
  mcapSol,
  openingReserves,
  presetRules,
  quoteLaunchSwap,
  quoteTrade,
  reservesAtMcap,
  rulesProblem,
  sideFeeBps,
  sniperLpFeeBps,
  virtualQuoteForSolPrice,
  type Side,
} from './bordrless';

type Vector = (typeof vectors.swaps)[number];

const big = (s: string) => BigInt(s);
const str = (v: bigint | null) => (v === null ? null : v.toString());

describe('quoteLaunchSwap matches the SDK vectors', () => {
  it.each(vectors.swaps.map((v, i) => [i, v] as [number, Vector]))('case %i', (_, v) => {
    const r = {
      baseReserve: big(v.reserves.baseReserve),
      quoteReserve: big(v.reserves.quoteReserve),
      virtualBase: big(v.reserves.virtualBase),
      virtualQuote: big(v.reserves.virtualQuote),
    };
    const p = { ...v.params, eligible: big(v.params.eligible), minEligible: big(v.params.minEligible) };
    const q = quoteLaunchSwap(r, v.side as Side, big(v.amountIn), v.lpFeeBps, v.protocolShareBps, p);
    expect({
      creatorFee: str(q.creatorFee),
      holderFee: str(q.holderFee),
      burn: str(q.burn),
      holderFeeOn: q.holderFeeOn,
      received: str(q.received),
      lpFee: str(q.lpFee),
      protocolFee: str(q.protocolFee),
      netIn: str(q.netIn),
      amountOut: str(q.amountOut),
      delivered: str(q.delivered),
      failure: q.failure,
    }).toEqual(v.expected);
  });
});

describe('headline fee per side', () => {
  it('matches the docs: Plain is 1.5437% (155 bps), Diamond hands 2.1694% (217 bps)', () => {
    expect(headlineFees(presetRules('plain'))).toEqual({ buyBps: 155, sellBps: 155 });
    expect(headlineFees(presetRules('diamond-hands'))).toEqual({ buyBps: 217, sellBps: 217 });
  });
  it('drops holder rewards while nobody is eligible', () => {
    expect(headlineFees(presetRules('diamond-hands'), LP_FEE_BPS, false).buyBps).toBe(sideFeeBps('buy', { lpFeeBps: 30, creatorFeeBps: 50, holderFeeBps: 0, burnBps: 0 }));
  });
  it('no rules pay only the LP fee', () => {
    expect(sideFeeBps('buy', { lpFeeBps: 30, creatorFeeBps: 0, holderFeeBps: 0, burnBps: 0 })).toBe(30);
  });
});

describe('sniper fee', () => {
  it('starts at 80% and falls linearly to 0.3% over 30 seconds', () => {
    expect(sniperLpFeeBps(0)).toBe(8_000);
    expect(sniperLpFeeBps(15)).toBe(8_000 - Math.floor((7_970 * 15) / 30));
    expect(sniperLpFeeBps(29)).toBeGreaterThan(30);
    expect(sniperLpFeeBps(30)).toBe(30);
    expect(sniperLpFeeBps(3_600)).toBe(30);
  });
});

describe('Half-Life exit fee', () => {
  it('matches the program tests', () => {
    const h = 21_600;
    expect(halfLifeFeePpm(0)).toBe(200_000);
    expect(halfLifeFeePpm(h / 2)).toBe(150_000);
    expect(halfLifeFeePpm(h)).toBe(100_000);
    expect(halfLifeFeePpm(2 * h)).toBe(50_000);
    expect(halfLifeFeePpm(4 * h)).toBe(12_500);
    expect(halfLifeFeePpm(7 * h)).toBe(1_562);
    expect(halfLifeFeePpm(8 * h - 1)).toBe(782);
    expect(halfLifeFeePpm(8 * h)).toBe(0);
  });
});

describe('the curve', () => {
  const vq = virtualQuoteForSolPrice(111.57847976406443);
  const p = curveParams(vq);
  it('opens at $5k and graduates at twice its virtual SOL, about 100.86 SOL here', () => {
    expect(mcapSol(openingReserves(p)) * 111.57847976406443).toBeCloseTo(5_000, -1);
    expect(Number(p.graduationQuote) / 1e9).toBeCloseTo(100.86, 1);
  });
  it('graduates at nine times the opening market cap', () => {
    expect(graduationMcapSol(p) / mcapSol(openingReserves(p))).toBeCloseTo(9, 6);
  });
  it('places a pool at any market cap, on the curve and after graduation', () => {
    for (const m of [60, 200, 400, 1_000, 5_000]) expect(mcapSol(reservesAtMcap(m, p)) / m).toBeCloseTo(1, 3);
  });
});

describe('quoteTrade', () => {
  const p = curveParams(virtualQuoteForSolPrice(150));
  const r = reservesAtMcap(200, p);
  it('accounts for every lamport of a buy as fee, impact or tokens', () => {
    const q = quoteTrade({ side: 'buy', amount: 1, rules: presetRules('plain'), reserves: r });
    expect(q.ok).toBe(true);
    expect(q.creatorFee).toBeCloseTo(0.01, 9);
    expect(q.protocolFee).toBeCloseTo(0.0025, 9);
    expect(q.lpFee).toBeCloseTo((1 - 0.01) * 0.003, 6);
    expect(q.totalFeesSol + q.impactSol + q.received * q.spotPrice).toBeCloseTo(1, 6);
  });
  it('a Half-Life sell in the first second loses a fifth to the furnace', () => {
    const q = quoteTrade({ side: 'sell', amount: 1_000_000, rules: presetRules('plain'), reserves: r, halfLifeAgeSecs: 0 });
    expect(q.halfLifeTokens).toBeCloseTo(200_000, 3);
  });
});

describe('rules and earnings', () => {
  it('refuses rules past the policy', () => {
    expect(rulesProblem(presetRules('burn'))).toBeNull();
    expect(rulesProblem({ creatorFeeBps: 200, holderFeeBuyBps: 200, holderFeeSellBps: 0, burnBuyBps: 0, burnSellBps: 0 })).toBe('total');
  });
  it('splits a day of volume', () => {
    const e = earnings({ volumeSol: 100, buyShare: 0.5, rules: presetRules('diamond-hands'), holdingShare: 0.1, companion: 'none' });
    expect(e.creatorFees).toBeCloseTo(0.5);
    expect(e.toHolders).toBeCloseTo(1);
    expect(e.yours).toBeCloseTo(0.1);
    expect(e.protocol).toBeCloseTo(0.375 + 0.3);
  });
});
