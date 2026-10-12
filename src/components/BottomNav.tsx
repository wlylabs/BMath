'use client';

import { usePathname } from 'next/navigation';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { ROUTES, samePage } from '../lib/routes';
import { NavLink } from './NavLink';
import { PixelIcon, type PixelIconName } from './PixelIcon';

const ITEMS: { href: string; label: 'home' | 'fee' | 'profit' | 'earn' | 'method'; icon: PixelIconName; tile: string }[] = [
  { href: ROUTES.home, label: 'home', icon: 'home', tile: 'bg-surface text-ink' },
  { href: ROUTES.fee, label: 'fee', icon: 'fee', tile: 'bg-green text-[#151515]' },
  { href: ROUTES.profit, label: 'profit', icon: 'profit', tile: 'bg-orange text-[#151515]' },
  { href: ROUTES.earn, label: 'earn', icon: 'earn', tile: 'bg-teal text-[#151515]' },
  { href: ROUTES.methodology, label: 'method', icon: 'book', tile: 'bg-sun text-[#151515]' },
];

/** The dock for phones and tablets: a row of coloured tiles, as on bordrless.app. Desktop uses the header. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label={t.nav.mobile}
      style={{ viewTransitionName: 'bottom-nav' }}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-[66px] max-w-xl grid-cols-5">
        {ITEMS.map(({ href, label, icon, tile }) => {
          const active = samePage(pathname, href);
          return (
            <li key={href} className="h-full">
              <NavLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                  tile,
                  active ? 'z-10 shadow-[inset_0_0_0_2px_var(--ink)]' : 'opacity-85 saturate-[0.85]',
                )}
              >
                {active && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-ink" style={{ viewTransitionName: 'tab-indicator' }} />}
                <PixelIcon name={icon} className="size-5" />
                {t.nav[label]}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
