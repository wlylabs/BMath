import { describe, expect, it } from 'vitest';
import { curveParams, graduationMcapSol, virtualQuoteForSolPrice, type Rules } from './bordrless';
import { modelLaunch } from './roundtrip';
import { rankOf, rng, SCENARIOS, simulate, typicalVolume, type SimInput } from './holderSim';

// $BMATH's own rules: 1% creator fee, 0.5% to holders and 0.5% burned on each side
const RULES: Rules = { creatorFeeBps: 100, holderFeeBuyBps: 50, holderFeeSellBps: 50, burnBuyBps: 50, burnSellBps: 50 };
const vq = virtualQuoteForSolPrice(150);
const open = 5_000 / 150;
const steady = SCENARIOS.find((s) => s.id === 'steady')!;
const base: SimInput = {
  pool: modelLaunch(vq, open),
  rules: RULES,
  split: { buyback: 0, holders: 0, launcher: 1 },
  entrySol: 1,
  scenario: steady,
  days: 30,
  seed: 42,
};

describe('rng', () => {
  it('repeats for a seed and stays in [0, 1)', () => {
    const a = rng(7);
    const b = rng(7);
    for (let i = 0; i < 1_000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('simulate', () => {
  it('plays the same game for the same seed', () => {
    expect(simulate(base)).toEqual(simulate(base));
    expect(simulate({ ...base, seed: 43 }).totalRewards).not.toBe(simulate(base).totalRewards);
  });

  it('runs one day per day and adds the rewards up', () => {
    const r = simulate(base);
    expect(r.ok).toBe(true);
    expect(r.days).toHaveLength(30);
    expect(r.days.at(-1)!.total).toBeCloseTo(r.days.reduce((s, d) => s + d.reward, 0), 9);
    expect(r.totalRewards).toBeGreaterThan(0);
  });

  it('pays you at most the holder fee on the volume', () => {
    const r = simulate(base);
    for (const d of r.days) expect(d.reward).toBeLessThanOrEqual(d.volumeSol * 0.005 + 1e-12);
  });

  it('dilutes an early holder as the market cap climbs', () => {
    const r = simulate(base);
    expect(r.days[0]!.share).toBeGreaterThan(r.days.at(-1)!.share);
    expect(r.days.every((d) => d.share > 0 && d.share <= 1)).toBe(true);
    expect(r.endMcap / r.startMcap).toBeCloseTo(steady.mcapMultiple, 6);
  });

  it('climbs for a month, then holds', () => {
    const week = simulate({ ...base, days: 7 });
    expect(week.endMcap / week.startMcap).toBeCloseTo(steady.mcapMultiple ** (7 / 30), 6);
    const quarter = simulate({ ...base, days: 90 });
    expect(quarter.endMcap).toBeCloseTo(simulate(base).endMcap, 6);
    expect(quarter.days[29]!.mcapSol).toBeCloseTo(quarter.days[89]!.mcapSol, 6);
  });

  it('a bigger bag earns more', () => {
    expect(simulate({ ...base, entrySol: 5 }).totalRewards).toBeGreaterThan(simulate(base).totalRewards);
  });

  it('marks the day the rewards cover the entry fees', () => {
    const r = simulate({ ...base, scenario: SCENARIOS.find((s) => s.id === 'viral')! });
    expect(r.paybackDay).not.toBeNull();
    const d = r.paybackDay!;
    expect(r.days[d - 1]!.total).toBeGreaterThanOrEqual(r.entryFees);
    if (d > 1) expect(r.days[d - 2]!.total).toBeLessThan(r.entryFees);
  });

  it('values the bag at the end with the sell fees taken', () => {
    const r = simulate(base);
    expect(r.sellValue).toBeGreaterThan(1);
    expect(r.sellValue).toBeLessThan(base.entrySol * steady.mcapMultiple);
  });

  it('keeps going past graduation', () => {
    const r = simulate({ ...base, scenario: { id: 'viral', volumeSol: 300, turnover: 1, mcapMultiple: 40 } });
    expect(r.days.some((d) => d.share < 1)).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.endMcap).toBeGreaterThan(graduationMcapSol(curveParams(vq)));
    expect(r.days.every((d) => Number.isFinite(d.reward) && Number.isFinite(d.share))).toBe(true);
  });

  it('fails cleanly on an empty buy', () => {
    expect(simulate({ ...base, entrySol: 0 }).ok).toBe(false);
  });
});

describe('typicalVolume', () => {
  it('has a floor for small tokens and follows the market cap for big ones', () => {
    expect(typicalVolume(steady, 10)).toBe(steady.volumeSol);
    expect(typicalVolume(steady, 100_000)).toBeCloseTo(100_000 * steady.turnover);
  });
});

describe('rankOf', () => {
  it('ranks by rewards per SOL put in', () => {
    expect(rankOf(0.01, 1)).toBe('tourist');
    expect(rankOf(0.1, 1)).toBe('holder');
    expect(rankOf(0.5, 1)).toBe('diamond');
    expect(rankOf(1.2, 1)).toBe('legend');
    expect(rankOf(1, 0)).toBe('tourist');
  });
});
