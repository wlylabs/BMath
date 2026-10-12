'use client';

import { compactUsd, num } from '../lib/format';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { ROUTES } from '../lib/routes';
import { useOverview } from '../hooks/useOverview';
import { NavLink } from './NavLink';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { LiveBadge } from './ui';

/** The platform's numbers right now, from bordrless.app. */
export function LiveStrip() {
  const { overview, solUsd, live } = useOverview();
  const cells = [
    { label: t.live.launches, value: overview ? num(overview.launches, 0) : '–' },
    { label: t.live.graduated, value: overview ? num(overview.graduated, 0) : '–' },
    { label: t.live.volume, value: overview ? compactUsd(overview.volume24hUsd) : '–' },
    { label: t.live.sol, value: live ? `$${num(solUsd, 2)}` : '–' },
  ];
  return (
    <section aria-labelledby="live-title" className="mx-auto max-w-[1360px] px-4 pb-4 pt-2 sm:px-6">
      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="live-title" className="label text-ink">
            {t.live.title}
          </h2>
          {live && <LiveBadge label={t.common.live} />}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cells.map((c) => (
            <div key={c.label} className="rounded border border-line bg-surface-2 px-3 py-2.5">
              <dt className="label text-muted">{c.label}</dt>
              <dd className="num mt-1 text-2xl font-semibold text-ink">{c.value}</dd>
            </div>
          ))}
        </dl>
        {!live && <p className="label mt-2 text-muted">{t.live.unavailable}</p>}
      </div>
    </section>
  );
}

/** One linked card per calculator, each on its section's colour, like the Bordrless project cards. */
export function ToolCards() {
  const cards: { href: string; icon: PixelIconName; tile: string; item: { title: string; body: string } }[] = [
    { href: ROUTES.fee, icon: 'fee', tile: 'bg-green', item: t.features.items[0]! },
    { href: ROUTES.profit, icon: 'profit', tile: 'bg-orange', item: t.features.items[1]! },
    { href: ROUTES.earn, icon: 'earn', tile: 'bg-teal', item: t.features.items[2]! },
  ];
  return (
    <section aria-labelledby="tools-title" className="mx-auto max-w-[1360px] px-4 py-10 sm:px-6 lg:py-14">
      <h2 id="tools-title" className="display text-4xl text-ink sm:text-5xl">
        {t.features.title}
      </h2>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {cards.map(({ href, icon, tile, item }, i) => (
          <NavLink key={href} href={href} className="card press-soft group flex flex-col p-3 hover:-translate-x-px hover:-translate-y-px">
            <span className={cx('relative flex h-32 items-center justify-center border border-ink text-[#151515] sm:h-40', tile)}>
              <PixelIcon name={icon} className="size-16 sm:size-20" />
              <span className="label absolute bottom-2 left-2 border border-ink bg-surface px-1.5 py-1 text-ink">0{i + 1}</span>
            </span>
            <span className="display mt-4 px-1 text-3xl text-ink">{item.title}</span>
            <span className="mt-2 flex-1 px-1 leading-relaxed text-ink-2">{item.body}</span>
            <span className="mt-4 flex items-center gap-2 border-t border-ink px-1 pt-3 font-semibold text-ink">
              {t.features.open}
              <PixelIcon name="arrow" className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </NavLink>
        ))}
      </div>
    </section>
  );
}
