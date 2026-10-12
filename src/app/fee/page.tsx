import type { Metadata } from 'next';
import { CalculatorPage } from '../../components/CalculatorPage';
import { FeeCalculator } from '../../components/calculators/FeeCalculator';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.calc.pages.fee.title,
  description: t.calc.pages.fee.lead,
  alternates: { canonical: ROUTES.fee },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.calc.pages.fee.title, description: t.calc.pages.fee.lead, url: ROUTES.fee },
};

export default function FeePage() {
  return (
    <PageTransition>
      <CalculatorPage active="fee">
        <FeeCalculator />
      </CalculatorPage>
    </PageTransition>
  );
}
