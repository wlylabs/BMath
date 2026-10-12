import { describe, expect, it } from 'vitest';
import rawLaunch from '../api/fixtures/bcat-launch.json';
import rawCandles from '../api/fixtures/bcat-candles.json';
import { reservesOf, toLaunch, type ApiLaunch, type Candle } from '../api/bordrless';
import { COMPANIONS } from './bordrless';
import { backtest, downsample, type HistoryInput } from './backtest';

// $BCAT: graduated, 1% creator fee, 1% to holders and 1% burned each side; candles from launch on
const launch = toLaunch(rawLaunch as unknown as ApiLaunch, 0);
const candles = (rawCandles as { candles: Candle[] }).candles;
const solUsd = launch.mcapUsd! / launch.mcapSol!;
const base: HistoryInput = {
  candles,
  rules: launch.rules,
  split: launch.companion ?? COMPANIONS.none,
  reserves: reservesOf(launch),
  supply: BigInt(launch.supply!),
  graduatedAt: launch.graduatedAt,
  solUsd,
  entrySol: 1,
};

describe('backtest', () => {
  const r = backtest(base);

  it('buys at the launch price and runs to the last candle', () => {
    expect(r.ok).toBe(true);
    expect(r.start).toBe(candles[0]!.t);
    expect(r.end).toBe(candles.at(-1)!.t);
    // Bordrless opens every launch at about a $5k market cap
    expect(r.entryMcapUsd).toBeGreaterThan(4_000);
    expect(r.entryMcapUsd).toBeLessThan(6_000);
    expect(r.athMcapUsd).toBeGreaterThanOrEqual(Math.max(...r.points.map((p) => p.mcapUsd)) - 1e-6);
  });

  it('pays no more than the holder fee on the real volume', () => {
    const volumeSol = candles.reduce((s, c) => s + c.v, 0) / solUsd;
    expect(r.totalRewards).toBeGreaterThan(0);
    expect(r.totalRewards).toBeLessThanOrEqual(volumeSol * 0.01 + 1e-9);
    expect(r.points.at(-1)!.total).toBeCloseTo(r.totalRewards, 9);
  });

  it('dilutes a launch buyer as others buy in', () => {
    expect(r.shareStart).toBeGreaterThan(r.shareNow);
    expect(r.shareNow).toBeGreaterThan(0);
  });

  it('values the bag at today’s pool', () => {
    // bought near $5k, the pool is now well above it
    expect(r.sellValue).toBeGreaterThan(1);
  });

  it('marks payback after the entry fees are covered', () => {
    if (r.paybackT === null) return;
    const at = r.points.find((p) => p.t >= r.paybackT!)!;
    expect(at.total).toBeGreaterThanOrEqual(r.entryFees - 1e-12);
  });

  it('a bigger bag earns more', () => {
    expect(backtest({ ...base, entrySol: 5 }).totalRewards).toBeGreaterThan(r.totalRewards);
  });

  it('fails cleanly without history', () => {
    expect(backtest({ ...base, candles: [] }).ok).toBe(false);
  });
});

describe('downsample', () => {
  it('keeps the ends and at most n points, in order', () => {
    const pts = Array.from({ length: 1_000 }, (_, i) => ({ t: i * 300, mcapUsd: i, total: i }));
    const d = downsample(pts, 100);
    expect(d.length).toBeLessThanOrEqual(101);
    expect(d[0]).toBe(pts[0]);
    expect(d.at(-1)).toBe(pts.at(-1));
    for (let k = 1; k < d.length; k++) expect(d[k]!.t).toBeGreaterThan(d[k - 1]!.t);
  });
});
