import type { Metadata } from 'next';
import { NotFoundBody } from '../components/NotFound';
import { t } from '../lib/copy';

export const metadata: Metadata = {
  title: t.notFound.title,
  robots: { index: false },
};

export default function NotFound() {
  return <NotFoundBody />;
}
