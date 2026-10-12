'use client';

import { usePathname } from 'next/navigation';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { CALCULATOR_KEYS, LAST_CALCULATOR_KEY, ROUTES, samePage } from '../lib/routes';
import { usePersistentState } from '../hooks/usePersistentState';
import { NavLink } from './NavLink';
import { PixelIcon, type PixelIconName } from './PixelIcon';

type Item = { href: string; label: 'home' | 'calculators' | 'play' | 'method'; icon: PixelIconName; tile: string; also?: readonly string[] };

const CALCULATOR_PAGES: readonly string[] = CALCULATOR_KEYS.map((k) => ROUTES[k]);

/** The dock for phones and tablets: a row of coloured tiles, as on bordrless.app. Wide screens use the header. */
export function BottomNav() {
  const pathname = usePathname();
  const [lastCalculator] = usePersistentState<string>(LAST_CALCULATOR_KEY, ROUTES.fee);
  // four tiles: the calculators share one, which opens the last one used; their own switcher and
  // swipes move between them
  const items: Item[] = [
    { href: ROUTES.home, label: 'home', icon: 'home', tile: 'bg-surface text-ink' },
    {
      href: CALCULATOR_PAGES.includes(lastCalculator) ? lastCalculator : ROUTES.fee,
      label: 'calculators',
      icon: 'fee',
      tile: 'bg-green text-[#151515]',
      also: CALCULATOR_PAGES,
    },
    { href: ROUTES.play, label: 'play', icon: 'play', tile: 'bg-orange text-[#151515]' },
    { href: ROUTES.methodology, label: 'method', icon: 'book', tile: 'bg-sun text-[#151515]' },
  ];
  return (
    <nav
      aria-label={t.nav.mobile}
      style={{ viewTransitionName: 'bottom-nav' }}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-bg pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      <ul className="mx-auto grid h-[66px] max-w-xl grid-cols-4">
        {items.map(({ href, label, icon, tile, also }) => {
          const active = samePage(pathname, href) || !!also?.some((p) => samePage(pathname, p));
          return (
            <li key={label} className="h-full">
              <NavLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex h-full flex-col items-center justify-center gap-1 text-[10.5px] font-semibold tracking-tight',
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
