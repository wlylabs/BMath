import { t } from './copy';

/**
 * Absolute origin for canonical, Open Graph and sitemap URLs. Set SITE_URL when
 * deploying anywhere other than Vercel, which provides its own production URL.
 */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const SITE_NAME = 'BMath';
export const SITE_TITLE = t.meta.title;
export const SITE_DESCRIPTION =
  'Independent calculator for Bordrless launches on Solana: every cut of a trade (creator fee, holder rewards, burn, sniper fee, Bordrless share), profit and break-even on the curve, and what a day of volume pays creators and holders.';

/**
 * Open Graph fields every page shares. Next merges metadata shallowly, so a
 * page that sets its own openGraph must spread this in or lose the preview image.
 */
export const BASE_OPEN_GRAPH = {
  type: 'website' as const,
  siteName: SITE_NAME,
  images: [{ url: '/og.png', width: 1200, height: 630, alt: SITE_TITLE }],
};

/** Who makes BMath. */
export const CREATOR = {
  name: 'Willy',
  handle: '@willydetrade',
  url: 'https://x.com/willydetrade',
} as const;

/** The launchpad BMath calculates for. A plain link: BMath has no referral. */
export const BORDRLESS_URL = 'https://bordrless.app';

export function bordrlessTokenUrl(mint: string): string {
  return `${BORDRLESS_URL}/token/${mint}`;
}
