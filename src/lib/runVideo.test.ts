import { describe, expect, it } from 'vitest';
import { daysAt, outroAt, VIDEO } from './runVideo';

describe('video timeline', () => {
  it('is 8 seconds of 1080p at 30 fps', () => {
    expect(VIDEO.seconds * VIDEO.fps).toBe(240);
    expect([VIDEO.width, VIDEO.height]).toEqual([1920, 1080]);
  });
  it('holds the hook for the first second, then reveals every day before the rank', () => {
    expect(daysAt(0.5, 30)).toBe(0);
    expect(daysAt(1, 30)).toBe(0);
    expect(daysAt(3, 30)).toBeGreaterThan(0);
    expect(daysAt(4.7, 30)).toBe(30);
    expect(daysAt(5, 30)).toBe(30);
    for (let t = 1; t < 4.7; t += 0.1) expect(daysAt(t + 0.1, 30)).toBeGreaterThanOrEqual(daysAt(t, 30));
  });
  it('covers the frame with the outro from 7 s and uncovers it to loop', () => {
    expect(outroAt(6.9)).toBe(0);
    expect(outroAt(7.5)).toBe(1);
    expect(outroAt(7.99)).toBeLessThan(0.05);
  });
});
