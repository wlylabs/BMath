/** Every page, with the trailing slash the static export serves it under. */
export const ROUTES = {
  home: '/',
  fee: '/fee/',
  profit: '/profit/',
  earn: '/earn/',
  halflife: '/half-life/',
  play: '/play/',
  methodology: '/methodology/',
  faq: '/faq/',
} as const;

export type CalculatorKey = 'fee' | 'profit' | 'earn' | 'halflife';

export const CALCULATOR_KEYS: readonly CalculatorKey[] = ['fee', 'profit', 'earn', 'halflife'];

/** Saved state key for the calculator last opened, which the dock's Calculators tile returns to. */
export const LAST_CALCULATOR_KEY = 'last-calculator';

/** "/fee", "/fee/" and "/fee/index.html" are the same page. */
export function samePage(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
  return norm(a) === norm(b);
}

/** Reading order of the app; moving right in it slides content left, like turning a page. */
const ORDER: readonly string[] = [
  ROUTES.home,
  ROUTES.fee,
  ROUTES.profit,
  ROUTES.earn,
  ROUTES.halflife,
  ROUTES.play,
  ROUTES.methodology,
  ROUTES.faq,
];

export type NavDirection = 'nav-forward' | 'nav-back';

/** Direction of a move between two pages, or null when it is not a move (same page, unknown page). */
export function navDirection(from: string, to: string): NavDirection | null {
  const a = ORDER.findIndex((p) => samePage(p, from));
  const b = ORDER.findIndex((p) => samePage(p, to.split(/[?#]/)[0]!));
  if (a === -1 || b === -1 || a === b) return null;
  return b > a ? 'nav-forward' : 'nav-back';
}

/** Neighbouring calculator for a swipe, if any. */
export function adjacentCalculator(path: string, step: 1 | -1): string | null {
  const i = CALCULATOR_KEYS.findIndex((k) => samePage(ROUTES[k], path));
  if (i === -1) return null;
  const next = CALCULATOR_KEYS[i + step];
  return next ? ROUTES[next] : null;
}
