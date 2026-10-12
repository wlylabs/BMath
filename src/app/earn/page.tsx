import type { Metadata } from 'next';
import { CalculatorPage } from '../../components/CalculatorPage';
import { EarnCalculator } from '../../components/calculators/EarnCalculator';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.calc.pages.earn.title,
  description: t.calc.pages.earn.lead,
  alternates: { canonical: ROUTES.earn },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.calc.pages.earn.title, description: t.calc.pages.earn.lead, url: ROUTES.earn },
};

export default function EarnPage() {
  return (
    <PageTransition>
      <CalculatorPage active="earn">
        <EarnCalculator />
      </CalculatorPage>
    </PageTransition>
  );
}
