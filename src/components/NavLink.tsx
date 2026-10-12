'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
import { navDirection } from '../lib/routes';

/**
 * next/link that tells the page transition which way to slide: further along
 * the app slides left, back towards Home slides right.
 */
export function NavLink(props: ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  const direction = navDirection(pathname, props.href);
  return <Link {...props} transitionTypes={direction ? [direction] : undefined} />;
}
