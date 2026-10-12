import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';
import { ROUTES } from '../lib/routes';

export const dynamic = 'force-static';

const PRIORITY: Record<keyof typeof ROUTES, number> = {
  home: 1,
  fee: 0.9,
  profit: 0.9,
  earn: 0.9,
  methodology: 0.6,
  faq: 0.5,
};

export default function sitemap(): MetadataRoute.Sitemap {
  return (Object.keys(ROUTES) as (keyof typeof ROUTES)[]).map((key) => ({
    url: `${SITE_URL}${ROUTES[key]}`,
    changeFrequency: 'weekly',
    priority: PRIORITY[key],
  }));
}
