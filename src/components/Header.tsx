'use client';

import { usePathname } from 'next/navigation';
import { t } from '../lib/copy';
import { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import { cx } from '../lib/cx';
import { ROUTES, samePage } from '../lib/routes';
import { BORDRLESS_URL } from '../lib/site';
import { InstallButton } from './pwa/PwaProvider';
import { NavLink } from './NavLink';
import { PixelIcon, type PixelIconName } from './PixelIcon';

/** Each section keeps one signal colour, in the header, the dock and the cards. */
export const SECTION_TONE = {
  fee: { text: 'text-green', bar: 'bg-green' },
  profit: { text: 'text-orange', bar: 'bg-orange' },
  earn: { text: 'text-teal', bar: 'bg-teal' },
  halflife: { text: 'text-plum', bar: 'bg-plum' },
  play: { text: 'text-orange', bar: 'bg-orange' },
  methodology: { text: 'text-sun-shade', bar: 'bg-sun' },
  faq: { text: 'text-spot', bar: 'bg-spot' },
} as const;

export function Header() {
  const { toggle } = useTheme();
  const pathname = usePathname();
  const links: { key: keyof typeof SECTION_TONE; href: string; label: string; icon: PixelIconName }[] = [
    { key: 'fee', href: ROUTES.fee, label: t.calc.tabs.fee, icon: 'fee' },
    { key: 'profit', href: ROUTES.profit, label: t.calc.tabs.profit, icon: 'profit' },
    { key: 'earn', href: ROUTES.earn, label: t.calc.tabs.earn, icon: 'earn' },
    { key: 'halflife', href: ROUTES.halflife, label: t.calc.tabs.halflife, icon: 'hourglass' },
    { key: 'play', href: ROUTES.play, label: t.nav.play, icon: 'play' },
    { key: 'methodology', href: ROUTES.methodology, label: t.nav.method, icon: 'book' },
    { key: 'faq', href: ROUTES.faq, label: t.nav.faq, icon: 'faq' },
  ];
  return (
    <header
      style={{ viewTransitionName: 'site-header' }}
      className="sticky top-0 z-40 border-b-2 border-ink bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        {t.nav.skip}
      </a>
      <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <NavLink href={ROUTES.home} className="group flex items-center gap-2.5" aria-label="BMath home">
            <span className="btn btn-icon !min-h-10 !border-ink p-0">
              <Logo className="size-7" />
            </span>
            <span className="display text-2xl text-ink">BMath</span>
          </NavLink>
          <nav aria-label={t.nav.primary} className="hidden items-center gap-0.5 xl:flex">
            {links.map((l, i) => {
              const active = samePage(pathname, l.href);
              return (
                <NavLink
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx('relative flex h-10 items-center gap-2 whitespace-nowrap px-2.5 text-[15px] font-semibold', active ? 'text-ink' : 'text-ink-2 hover:text-ink')}
                >
                  <PixelIcon name={l.icon} className={cx('size-[18px]', SECTION_TONE[l.key].text)} />
                  {/* named so the text stays above the bar while it glides past (vt-tab-label in globals.css) */}
                  <span className="vt-tab-label relative" style={{ viewTransitionName: `header-tab-${i}` }}>
                    {l.label}
                  </span>
                  {active && (
                    <span
                      aria-hidden
                      className={cx('absolute inset-x-2.5 bottom-0.5 h-[3px]', SECTION_TONE[l.key].bar)}
                      style={{ viewTransitionName: 'header-indicator' }}
                    />
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <InstallButton />
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
            aria-label={t.header.toggleTheme}
            title={t.header.toggleTheme}
            className="btn btn-icon"
          >
            {/* both icons render on the server; CSS picks one so the first paint matches the theme */}
            <PixelIcon name="sun" className="theme-icon hidden size-[18px] dark:block" />
            <PixelIcon name="moon" className="theme-icon block size-[18px] dark:hidden" />
          </button>
          <a
            href={BORDRLESS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.header.bordrlessLabel}
            className="btn btn-ink hidden !min-h-10 sm:inline-flex"
          >
            {t.header.bordrless}
            <PixelIcon name="external" className="size-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}
