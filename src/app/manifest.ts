import type { MetadataRoute } from 'next';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '../lib/site';
import { BRAND } from '../lib/brand';
import { ROUTES } from '../lib/routes';

export const dynamic = 'force-static';

const ICON = [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: 'en',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: BRAND.lightBg,
    theme_color: BRAND.lightBg,
    categories: ['finance', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Trade fee', short_name: 'Fee', description: 'Every cut of one Bordrless trade', url: ROUTES.fee, icons: ICON },
      { name: 'Profit & target', short_name: 'Profit', description: 'Net profit and break-even on the curve', url: ROUTES.profit, icons: ICON },
      { name: 'Creator & holders', short_name: 'Earn', description: 'What a day of volume pays', url: ROUTES.earn, icons: ICON },
      { name: 'Half-Life exit fee', short_name: 'Half-Life', description: 'Sell now or wait', url: ROUTES.halflife, icons: ICON },
    ],
    screenshots: [
      {
        src: '/screenshots/narrow.png',
        sizes: '780x1688',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Trade fee calculator on a phone',
      },
      {
        src: '/screenshots/wide.png',
        sizes: '1440x900',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Trade fee calculator with every cut of a Bordrless trade',
      },
    ],
  };
}
