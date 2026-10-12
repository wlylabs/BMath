# BMath

An independent fee and profit calculator for [Bordrless](https://bordrless.app) launches on Solana. No wallet, no login, no referral: every number is computed in the browser.

- **Trade fee**: every cut of one buy or sell on a launch pool (creator fee, holder rewards, burn, the LP and sniper fee, Bordrless's 25% share, Half-Life's exit fee) plus the curve's price impact.
- **Profit & target**: buy at one market cap, sell at another; net profit, break-even multiple and the road to graduation.
- **Creator & holders**: what a day of volume pays the creator, the holders and Bordrless, with companion splits.

Any Bordrless launch can be looked up live (rules, pool reserves, market cap) from bordrless.app's public API.

## The math

`src/lib/bordrless.ts` is a port of the launch-pool quote in the public [bordrless-sdk](https://github.com/BordrlessDex/bordrless-sdk) (Apache-2.0). `src/lib/bordrless.test.ts` replays all 440 swap vectors the SDK publishes (`src/lib/vectors/launch-swaps.json`) and requires exact, lamport-level equality.

## Develop

```sh
npm ci
npm run dev        # http://localhost:3000
npm test
npm run typecheck
npm run lint
npm run build      # static export to out/, plus the service worker
```

## Deploy

The site is a static export. The Bordrless API sends no CORS headers, so the browser reaches it through this site's own origin at `/api/bordrless/<path>/`:

- **Vercel**: `vercel.json` already rewrites it to `https://bordrless.app/api/<path>`.
- **`next dev`**: `next.config.ts` adds the same rewrite.
- **Elsewhere**: add an equivalent proxy, or point `NEXT_PUBLIC_BORDRLESS_API` at one. Without it the calculators still work on modelled launches; only the live lookup is unavailable.

Set `SITE_URL` when deploying anywhere other than Vercel, for canonical and Open Graph URLs.

Not affiliated with Bordrless. Not financial advice.
