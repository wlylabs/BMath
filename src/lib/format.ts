const LOCALE = 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opts);
    cache.set(key, f);
  }
  return f;
}

/** USD amounts. Sub-cent values keep enough digits to stay meaningful. */
export function usd(n: number, opts: { signed?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  const s = nf({
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  }).format(n);
  return s;
}

export function compactUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return nf({
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    // pinned: Node and browsers default the minimum differently, which breaks hydration
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Fraction to percent: 0.0195 -> "1.95%". */
export function pct(n: number | null | undefined, opts: { digits?: number; signed?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const digits = opts.digits ?? 2;
  return nf({
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  }).format(n);
}

/** Prices from $90,000 BTC down to $0.000004 memecoins. */
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  const opts: Intl.NumberFormatOptions =
    abs >= 1000
      ? { maximumFractionDigits: 2, minimumFractionDigits: 2 }
      : abs >= 1
        ? { maximumFractionDigits: 4, minimumFractionDigits: 2 }
        : { maximumSignificantDigits: 4, minimumSignificantDigits: 2 };
  return '$' + nf(opts).format(n);
}

export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '-';
  return nf({ maximumFractionDigits: digits }).format(n);
}

export function multiple(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const digits = n < 10 ? 3 : n < 100 ? 2 : 1;
  return nf({ maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }).format(n) + 'x';
}

export function time(ts: number): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(ts);
}

export function date(iso: string): string {
  // pinned to UTC so the build and every visitor show the same calendar day
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso + 'T00:00:00Z'),
  );
}

/**
 * Parses what people type into amount fields. Dot is the decimal mark and
 * comma groups thousands ("1,250.50"). A comma that cannot be grouping
 * ("0,5", "12,75") is read as a decimal mark for people used to that style,
 * and a repeated dot ("1.250.000") as grouping.
 */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[\s$%_]/g, '');
  if (!s) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized = s;
  if (lastDot !== -1 && lastComma !== -1) {
    const dec = lastDot > lastComma ? '.' : ',';
    const group = dec === '.' ? ',' : '.';
    normalized = s.split(group).join('').replace(dec, '.');
  } else if (lastComma !== -1) {
    const parts = s.split(',');
    const grouping = parts[0] !== '' && parts.slice(1).every((p) => p.length === 3) && parts[0] !== '0';
    normalized = grouping ? parts.join('') : parts.length === 2 ? parts.join('.') : 'x';
  } else if (lastDot !== -1) {
    const parts = s.split('.');
    normalized = parts.length > 2 ? parts.join('') : s;
  }
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '.') return NaN;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/** Inputs with a comma or repeated dots get an echo of how they were read. */
export function isAmbiguousAmount(raw: string): boolean {
  const v = raw.trim();
  return v.includes(',') || (v.match(/\./g)?.length ?? 0) > 1;
}

/** Shortens long mint/contract addresses for display. */
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a;
}
