import type { Metadata } from 'next';
import { Methodology } from '../../components/Sections';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.method.title,
  description: t.method.lead,
  alternates: { canonical: ROUTES.methodology },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.method.title, description: t.method.lead, url: ROUTES.methodology },
};

export default function MethodologyPage() {
  return (
    <PageTransition>
      <Methodology />
    </PageTransition>
  );
}
