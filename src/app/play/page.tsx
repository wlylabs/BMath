import type { Metadata } from 'next';
import { HolderSim } from '../../components/HolderSim';
import { PixelIcon } from '../../components/PixelIcon';
import { t } from '../../lib/copy';
import { ROUTES } from '../../lib/routes';
import { BASE_OPEN_GRAPH } from '../../lib/site';
import { PageTransition } from '../../components/PageTransition';

export const metadata: Metadata = {
  title: t.play.title,
  description: t.play.lead,
  alternates: { canonical: ROUTES.play },
  openGraph: { ...BASE_OPEN_GRAPH, title: t.play.title, description: t.play.lead, url: ROUTES.play },
};

export default function PlayPage() {
  return (
    <PageTransition>
      <section className="mx-auto max-w-[1360px] px-4 pb-12 pt-8 sm:px-6 lg:pb-16 lg:pt-12" aria-labelledby="play-title">
        <span className="tag">
          <PixelIcon name="play" className="size-3" />
          {t.play.tag}
        </span>
        <h1 id="play-title" className="display mt-4 text-5xl text-ink sm:text-7xl">
          {t.play.title}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{t.play.lead}</p>
        <div className="mt-8">
          <HolderSim />
        </div>
      </section>
    </PageTransition>
  );
}
