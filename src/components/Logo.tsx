import { MARK } from '../lib/brand';
import { cx } from '../lib/cx';

/** The BMath mark: see MARK in lib/brand.ts. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 20 20" aria-hidden className={cx('pixel', className)}>
      <rect x="-2" y="-2" width="20" height="20" rx="1.5" fill="var(--sun)" />
      <path d={MARK.glyph} fill="#0e0e0e" />
      <path d={MARK.slice} fill="var(--spot)" />
    </svg>
  );
}
