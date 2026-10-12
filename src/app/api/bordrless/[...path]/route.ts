import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to bordrless.app's public API, which sends no CORS headers. Only the four
 * read endpoints BMath uses pass; answers are cached for a minute here and on the CDN, so a busy
 * page costs Bordrless one request a minute per URL.
 */
const UPSTREAM = 'https://bordrless.app/api';
const TTL = 60;
const ALLOWED = [/^overview$/, /^launches$/, /^launches\/[1-9A-HJ-NP-Za-km-z]{32,44}$/, /^launches\/[1-9A-HJ-NP-Za-km-z]{32,44}\/candles$/];
const QUERY_KEYS = new Set(['q', 'sort', 'limit', 'offset']);

function json(body: unknown, status: number, cache: string) {
  return Response.json(body, { status, headers: { 'Cache-Control': cache } });
}

// typed by hand: the global RouteContext only exists after `next typegen`, which CI's typecheck runs before
export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path.join('/');
  if (!ALLOWED.some((re) => re.test(path))) return json({ error: 'not found' }, 404, 'public, s-maxage=3600');

  // forward only the parameters the endpoints take, so junk queries cannot fan out the cache
  const query = new URLSearchParams();
  for (const [k, v] of request.nextUrl.searchParams) if (QUERY_KEYS.has(k)) query.set(k, v.slice(0, 64));
  const url = `${UPSTREAM}/${path}${query.size ? `?${query}` : ''}`;

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'BMath (+https://bordrlessmath.vercel.app)' },
      next: { revalidate: TTL },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) return json({ error: 'not found' }, 404, `public, s-maxage=${TTL}`);
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return json(await res.json(), 200, `public, max-age=0, s-maxage=${TTL}, stale-while-revalidate=300`);
  } catch (e) {
    console.error('bordrless proxy', url, e);
    return json({ error: 'upstream unavailable' }, 502, 'no-store');
  }
}
