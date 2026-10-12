import { Hero } from '../components/Hero';
import { LiveStrip, ToolCards } from '../components/Home';
import { CREATOR, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../lib/site';
import { PageTransition } from '../components/PageTransition';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: CREATOR.name, url: CREATOR.url },
};

export default function HomePage() {
  return (
    <PageTransition>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Hero />
      <LiveStrip />
      <ToolCards />
    </PageTransition>
  );
}
