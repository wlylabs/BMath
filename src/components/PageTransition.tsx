import { ViewTransition, type ReactNode } from 'react';

/**
 * Slides page content in the direction of travel during client-side
 * navigation. Lives in each page, not the layout: layouts persist, so their
 * enter and exit never fire. Navigations without a direction (browser back,
 * refresh) swap instantly.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const types = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' };
  return (
    <ViewTransition enter={types} exit={types} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
