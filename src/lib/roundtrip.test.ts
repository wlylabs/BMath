import { describe, expect, it } from 'vitest';
import { presetRules, virtualQuoteForSolPrice, curveParams, graduationMcapSol } from './bordrless';
import { breakEvenMcap, graduationInfo, modelLaunch, modelPool, roundTrip } from './roundtrip';

const vq = virtualQuoteForSolPrice(150);
const open = 5_000 / 150;

describe('roundTrip', () => {
  const pool = modelLaunch(vq, open * 2);
  const base = { pool, amount: 1, entryMcap: open * 2, rules: presetRules('plain'), holdersOn: true, halfLifeHours: null };

  it('selling at the entry market cap loses the fees on both sides and the impact', () => {
    const r = roundTrip({ ...base, exitMcap: open * 2 });
    expect(r.ok).toBe(true);
    expect(r.net).toBeLessThan(0);
    expect(r.net).toBeCloseTo(-(r.feesBuy + r.feesSell + r.impact), 2);
  });

  it('a 3x market cap roughly triples the SOL, less fees', () => {
    const r = roundTrip({ ...base, exitMcap: open * 6 });
    expect(r.back).toBeGreaterThan(2.7);
    expect(r.back).toBeLessThan(3);
  });

  it('break-even sits a little above the entry', () => {
    const m = breakEvenMcap(base)!;
    expect(m / (open * 2)).toBeGreaterThan(1.02);
    expect(m / (open * 2)).toBeLessThan(1.1);
    expect(roundTrip({ ...base, exitMcap: m }).back).toBeCloseTo(1, 4);
  });

  it('Half-Life sold at once costs a fifth more', () => {
    const plain = roundTrip({ ...base, exitMcap: open * 4 });
    const hl = roundTrip({ ...base, exitMcap: open * 4, halfLifeHours: 0 });
    expect(hl.back / plain.back).toBeCloseTo(0.8, 1);
    expect(roundTrip({ ...base, exitMcap: open * 4, halfLifeHours: 48 }).back).toBeCloseTo(plain.back, 9);
  });
});

describe('pools', () => {
  it('a graduated pool keeps its constant product', () => {
    const p = modelPool({ baseReserve: 278_561_888_200_624n, quoteReserve: 92_860_215_072n, virtualBase: 0n, virtualQuote: 0n }, 973_831_755_643_425n);
    const r = p.at(640);
    expect(Number(r.baseReserve) * Number(r.quoteReserve)).toBeCloseTo(278_561_888_200_624 * 92_860_215_072, -20);
    expect(graduationInfo(p, null)).toBeNull();
  });
  it('a curve knows how far graduation is', () => {
    const g = graduationInfo(modelLaunch(vq, open), null)!;
    expect(g.mcap).toBeCloseTo(graduationMcapSol(curveParams(vq)));
    expect(g.left).toBeCloseTo(g.raise, 6);
  });
});
