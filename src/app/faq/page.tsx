import type { Metadata } from 'next';
import { Faq } from '../../components/Sections';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

const DESCRIPTION = 'Answers on what BMath counts, where its live numbers come from, the sniper fee, holder rewards and price impact on Bordrless.';

export const metadata: Metadata = {
  title: t.faq.title,
  description: DESCRIPTION,
  alternates: { canonical: ROUTES.faq },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.faq.title, description: DESCRIPTION, url: ROUTES.faq },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: t.faq.items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <PageTransition>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <Faq />
    </PageTransition>
  );
}
