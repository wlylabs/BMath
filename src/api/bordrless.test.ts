import { describe, expect, it } from 'vitest';
import raw from './fixtures/bmath-launch.json';
import { toLaunch, type ApiLaunch } from './bordrless';
import { earnings, headlineFees } from '../lib/bordrless';

// GET bordrless.app/api/launches/EAgDeURNR7QzDiHNjhVwWvmsBN8mcU7FiNLBzqUBHLE9 right after launch
const launch = toLaunch(raw as unknown as ApiLaunch, 0);

describe('BMATH, as the API reports it', () => {
  it('reads the Burn preset with the companion’s fee inside the creator fee', () => {
    expect(launch.rules).toEqual({ creatorFeeBps: 100, holderFeeBuyBps: 50, holderFeeSellBps: 50, burnBuyBps: 50, burnSellBps: 50 });
    expect(launch.companion).toEqual({ template: 'rugProofDev', buyback: 0, holders: 0.5, launcher: 0.5 });
  });

  it('sees holder rewards off while nobody holds enough, as the API’s 2.04% says', () => {
    expect(launch.holdersOn).toBe(false);
    expect(headlineFees(launch.rules, 30, false)).toEqual({ buyBps: 204, sellBps: 204 });
    expect(headlineFees(launch.rules, 30, true)).toEqual({ buyBps: 266, sellBps: 266 });
  });

  it('splits a day of volume by the companion’s own split', () => {
    const e = earnings({ volumeSol: 100, buyShare: 0.5, rules: launch.rules, holdingShare: 0, companion: 'none', split: launch.companion });
    expect(e.creatorFees).toBeCloseTo(1);
    expect(e.toLauncher).toBeCloseTo(0.5);
    // the rule's 0.5% plus the companion's half of the creator fee
    expect(e.toHolders).toBeCloseTo(0.5 + 0.5);
  });
});
