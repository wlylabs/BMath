'use client';

import type { ReactNode } from 'react';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { CALCULATOR_KEYS, ROUTES, type CalculatorKey } from '../lib/routes';
import { UrlCleaner } from './UrlCleaner';
import { NavLink } from './NavLink';
import { SwipeNav } from './SwipeNav';

/**
 * Shared frame for the three calculator pages: a numbered switcher (as on the Bordrless launch
 * form), the heading, then the tool. On touch screens a sideways swipe moves between them.
 */
export function CalculatorPage({ active, children }: { active: CalculatorKey; children: ReactNode }) {
  const page = t.calc.pages[active];
  return (
    <SwipeNav className="mx-auto max-w-[1360px] px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:pb-16">
      <UrlCleaner />
      <nav
        aria-label={t.calc.tabsLabel}
        style={{ viewTransitionName: 'calc-switcher' }}
        className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {CALCULATOR_KEYS.map((key, i) => {
          const on = key === active;
          return (
            <NavLink
              key={key}
              href={ROUTES[key]}
              aria-current={on ? 'page' : undefined}
              className={cx('btn btn-sm shrink-0 gap-2 !pl-1.5', on && 'btn-ink')}
            >
              <span
                aria-hidden
                className={cx('num flex size-6 items-center justify-center border text-xs', on ? 'border-current' : 'border-ink')}
              >
                {i + 1}
              </span>
              <span className="vt-tab-label relative" style={{ viewTransitionName: `calc-tab-${key}` }}>
                {t.calc.tabs[key]}
              </span>
            </NavLink>
          );
        })}
      </nav>
      <h1 className="display text-[2.75rem] text-ink sm:text-6xl">{page.title}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-2">{page.lead}</p>
      <div className="mt-6">{children}</div>
    </SwipeNav>
  );
}
