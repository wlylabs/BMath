import type { Metadata } from 'next';
import { CalculatorPage } from '../../components/CalculatorPage';
import { ProfitCalculator } from '../../components/calculators/ProfitCalculator';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.calc.pages.profit.title,
  description: t.calc.pages.profit.lead,
  alternates: { canonical: ROUTES.profit },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.calc.pages.profit.title, description: t.calc.pages.profit.lead, url: ROUTES.profit },
};

export default function ProfitPage() {
  return (
    <PageTransition>
      <CalculatorPage active="profit">
        <ProfitCalculator />
      </CalculatorPage>
    </PageTransition>
  );
}
