import type { Metadata } from 'next';
import { CalculatorPage } from '../../components/CalculatorPage';
import { HalfLifeCalculator } from '../../components/calculators/HalfLifeCalculator';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.calc.pages.halflife.title,
  description: t.calc.pages.halflife.lead,
  alternates: { canonical: ROUTES.halflife },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.calc.pages.halflife.title, description: t.calc.pages.halflife.lead, url: ROUTES.halflife },
};

export default function HalfLifePage() {
  return (
    <PageTransition>
      <CalculatorPage active="halflife">
        <HalfLifeCalculator />
      </CalculatorPage>
    </PageTransition>
  );
}
