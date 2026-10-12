import { useCallback } from 'react';
import { BRAND } from '../lib/brand';

export type Theme = 'light' | 'dark';

/**
 * The theme lives on <html data-theme>, set by an inline script before first
 * paint, so components style themselves with CSS and never read it in render.
 *
 * Toggling reveals the new palette in a circle that grows from `origin` (the
 * button) using a view transition; see "theme switch" in globals.css. Without
 * view transitions, or with reduced motion, it swaps in one frame.
 */
export function useTheme() {
  const toggle = useCallback((origin?: { x: number; y: number }) => {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? BRAND.darkBg : BRAND.lightBg);
    };
    try {
      localStorage.setItem('bmath:theme', next);
    } catch {
      /* ignore */
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!origin || reduce || typeof document.startViewTransition !== 'function') {
      apply();
      return;
    }
    const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    root.style.setProperty('--reveal-x', `${origin.x}px`);
    root.style.setProperty('--reveal-y', `${origin.y}px`);
    root.style.setProperty('--reveal-r', `${Math.ceil(radius)}px`);
    root.classList.add('theme-switch');
    const done = () => {
      root.classList.remove('theme-switch');
      for (const p of ['--reveal-x', '--reveal-y', '--reveal-r']) root.style.removeProperty(p);
    };
    document.startViewTransition(apply).finished.then(done, done);
  }, []);
  return { toggle };
}
