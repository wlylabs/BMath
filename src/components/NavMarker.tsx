'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sets <html data-nav> on the first client-side navigation. First-load
 * entrances (.rise in globals.css) check for it, so they play when the site
 * opens but not again under a page transition.
 */
export function NavMarker() {
  const pathname = usePathname();
  const first = useRef(pathname);
  useLayoutEffect(() => {
    if (pathname !== first.current) document.documentElement.dataset.nav = '';
  }, [pathname]);
  return null;
}
