import { HALF_LIFE, headlineFees, type Reserves, type Rules } from '../lib/bordrless';

/**
 * Bordrless's public API (the one bordrless.app itself reads). It sends no CORS headers, so the
 * browser reaches it through this site's own route handler (src/app/api/bordrless), which caches
 * each answer for a minute. Set NEXT_PUBLIC_BORDRLESS_API to point somewhere else.
 */
const BASE = process.env.NEXT_PUBLIC_BORDRLESS_API ?? '/api/bordrless';

/** Bordrless mints are base58 public keys. */
export const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface ApiLaunch {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  status: 'curve' | 'graduated';
  createdAt: number;
  priceQuote: number | null;
  priceUsd: number | null;
  mcapUsd: number | null;
  mcapQuote: number | null;
  progress: number;
  volume24hUsd: number | null;
  volume24hQuote: string;
  holders: number;
  creatorFeeBps: number;
  lpFeeBps: number;
  sniperWindowEndsAt: number;
  rules: { holderFeeBuyBps: number; holderFeeSellBps: number; burnBuyBps: number; burnSellBps: number; maxWalletBps: number };
  preset: string | null;
  customHook: { program?: string } | null;
  buyFeeBps: number;
  sellFeeBps: number;
  baseReserve?: string;
  quoteReserve?: string;
  virtualBase?: string;
  virtualQuote?: string;
  graduationQuote?: string;
  supply?: string;
}

/** A launch as the calculators use it. Amounts are strings so the token can be saved as JSON. */
export interface Launch {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  status: 'curve' | 'graduated';
  createdAt: number;
  priceUsd: number | null;
  priceSol: number | null;
  mcapUsd: number | null;
  mcapSol: number | null;
  progress: number;
  volume24hUsd: number | null;
  volume24hSol: number;
  holders: number;
  rules: Rules;
  lpFeeBps: number;
  /** Holder rewards are flowing: holders together hold at least 0.1% of the supply. */
  holdersOn: boolean;
  buyFeeBps: number;
  sellFeeBps: number;
  preset: string | null;
  /** The launch runs a token hook of its creator's choosing (not the kit). */
  customHook: boolean;
  /** That hook is Half-Life, Bordrless's own (programs/half_life). */
  halfLife: boolean;
  reserves: { baseReserve: string; quoteReserve: string; virtualBase: string; virtualQuote: string } | null;
  graduationQuote: string | null;
  supply: string | null;
  fetchedAt: number;
}

export interface Overview {
  solUsd: number;
  launches: number;
  graduated: number;
  volume24hUsd: number;
}

async function get<T>(path: string, query: URLSearchParams | null, signal?: AbortSignal): Promise<T> {
  // with the trailing slash the site's own trailingSlash setting has nothing to redirect
  const res = await fetch(`${BASE}${path}/${query ? `?${query}` : ''}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Bordrless API ${res.status}`);
  return (await res.json()) as T;
}

function toLaunch(a: ApiLaunch, fetchedAt: number): Launch {
  const rules: Rules = {
    creatorFeeBps: a.creatorFeeBps,
    holderFeeBuyBps: a.rules.holderFeeBuyBps,
    holderFeeSellBps: a.rules.holderFeeSellBps,
    burnBuyBps: a.rules.burnBuyBps,
    burnSellBps: a.rules.burnSellBps,
  };
  // the API leaves holder rewards out of its figures while nobody is eligible; that tells us which
  const on = headlineFees(rules, a.lpFeeBps, true);
  const holdersOn = on.buyBps === a.buyFeeBps && on.sellBps === a.sellFeeBps;
  const hasReserves = a.baseReserve !== undefined && a.quoteReserve !== undefined;
  return {
    mint: a.mint,
    name: a.name,
    symbol: a.symbol,
    image: a.image,
    status: a.status,
    createdAt: a.createdAt,
    priceUsd: a.priceUsd,
    priceSol: a.priceQuote,
    mcapUsd: a.mcapUsd,
    mcapSol: a.mcapQuote,
    progress: a.progress,
    volume24hUsd: a.volume24hUsd,
    volume24hSol: Number(a.volume24hQuote) / 1e9 || 0,
    holders: a.holders,
    rules,
    lpFeeBps: a.lpFeeBps,
    holdersOn,
    buyFeeBps: a.buyFeeBps,
    sellFeeBps: a.sellFeeBps,
    preset: a.preset,
    customHook: !!a.customHook,
    halfLife: a.customHook?.program === HALF_LIFE.program,
    reserves: hasReserves
      ? { baseReserve: a.baseReserve!, quoteReserve: a.quoteReserve!, virtualBase: a.virtualBase ?? '0', virtualQuote: a.virtualQuote ?? '0' }
      : null,
    graduationQuote: a.graduationQuote ?? null,
    supply: a.supply ?? null,
    fetchedAt,
  };
}

export function reservesOf(l: Launch): Reserves | null {
  if (!l.reserves) return null;
  return {
    baseReserve: BigInt(l.reserves.baseReserve),
    quoteReserve: BigInt(l.reserves.quoteReserve),
    virtualBase: BigInt(l.reserves.virtualBase),
    virtualQuote: BigInt(l.reserves.virtualQuote),
  };
}

/** Launches matching a name, ticker or mint, biggest first. An empty query lists the top ones. */
export async function searchLaunches(q: string, signal?: AbortSignal): Promise<Launch[]> {
  const params = new URLSearchParams({ sort: 'mcap', limit: '12' });
  if (q) params.set('q', q);
  const data = await get<{ launches: ApiLaunch[] }>('/launches', params, signal);
  const now = Date.now();
  return data.launches.map((l) => toLaunch(l, now));
}

/** One launch with its pool reserves, or null when the mint is not a Bordrless launch. */
export async function getLaunch(mint: string, signal?: AbortSignal): Promise<Launch | null> {
  try {
    return toLaunch(await get<ApiLaunch>(`/launches/${encodeURIComponent(mint)}`, null, signal), Date.now());
  } catch (e) {
    if ((e as Error).message === 'Bordrless API 404') return null;
    throw e;
  }
}

/** SOL's dollar price and the platform's totals. */
export async function getOverview(signal?: AbortSignal): Promise<Overview> {
  const o = await get<{ solUsd: number; launches: number; graduated: number; volume24hUsd: number }>('/overview', null, signal);
  return { solUsd: o.solUsd, launches: o.launches, graduated: o.graduated, volume24hUsd: o.volume24hUsd };
}
