import { describe, expect, it } from 'vitest';
import { primitivesFrom } from './urlState';
import { samePage } from './routes';

const INITIAL = { chain: 'solana', amount: '100', referral: false, leverage: 5, token: null as null | object };

describe('primitivesFrom', () => {
  it('reads only known primitive fields, coerced to their types', () => {
    const p = new URLSearchParams('chain=base&amount=250.5&referral=1&leverage=10&token=x&evil=1');
    expect(primitivesFrom(INITIAL, p, { chain: ['solana', 'base'] })).toEqual({
      chain: 'base',
      amount: '250.5',
      referral: true,
      leverage: 10,
    });
  });

  it('drops enum values that are not allowed and strips junk from amounts', () => {
    const p = new URLSearchParams('chain=<script>&amount=12a3<b>&leverage=abc');
    expect(primitivesFrom(INITIAL, p, { chain: ['solana', 'base'] })).toEqual({ amount: '123' });
  });
});

describe('samePage', () => {
  it('treats trailing slashes and index.html as the same page', () => {
    expect(samePage('/fee', '/fee/')).toBe(true);
    expect(samePage('/fee/index.html', '/fee/')).toBe(true);
    expect(samePage('/', '/')).toBe(true);
    expect(samePage('/index.html', '/')).toBe(true);
    expect(samePage('/profit/', '/fee/')).toBe(false);
    expect(samePage('/', '/fee/')).toBe(false);
  });
});
