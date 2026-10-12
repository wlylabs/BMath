'use client';

import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { CALCULATOR_KEYS, ROUTES, adjacentCalculator, samePage } from '../lib/routes';

// Thresholds follow Vaul (velocity 0.4 px/ms) and Sonner (axis lock on the first
// real move). Page swipes need more travel than a toast dismiss because a
// misfire costs a navigation.
const EDGE = 24; // left to the OS back gesture
const LOCK = 10;
const DISTANCE = 80;
const VELOCITY = 0.4;
const MIN_FLICK = 40;

/** Starts on these never become a page swipe: they own horizontal drags. */
const OWNS_DRAG = 'input, textarea, select, [contenteditable], [role="listbox"], [data-no-swipe]';

function ownsHorizontalDrag(target: EventTarget | null, root: HTMLElement): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
    if (el.matches(OWNS_DRAG)) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

interface Drag {
  id: number;
  x: number;
  y: number;
  time: number;
  /** Set once the gesture locks to the horizontal axis towards a real page. */
  step: 1 | -1 | null;
  href: string;
}

/**
 * Swipe left or right on a calculator to open the next or previous one, like
 * tabs in a native app. Touch only; the page keeps vertical scrolling and
 * pinch zoom. A chip at the screen edge names where the swipe leads and
 * fills in once letting go would go there.
 */
export function SwipeNav({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const chipRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [hint, setHint] = useState<{ step: 1 | -1; href: string } | null>(null);
  const [armed, setArmed] = useState(false);

  const labelFor = (href: string) => {
    const key = CALCULATOR_KEYS.find((k) => samePage(ROUTES[k], href));
    return key ? t.calc.tabs[key] : '';
  };

  const moveChip = (progress: number, animate: boolean) => {
    const chip = chipRef.current;
    if (!chip) return;
    chip.style.transition = animate
      ? 'translate var(--dur-base) var(--ease-drawer), opacity var(--dur-fast) var(--ease-standard)'
      : 'none';
    chip.style.setProperty('--p', String(progress));
  };

  const reset = () => {
    drag.current = null;
    setArmed(false);
    moveChip(0, true);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
    if (ownsHorizontalDrag(e.target, e.currentTarget)) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, step: null, href: '' };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.step === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK) return;
      // vertical intent: leave it to the page scroll
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      const step = dx < 0 ? 1 : -1;
      const href = adjacentCalculator(pathname, step);
      if (!href) {
        drag.current = null;
        return;
      }
      d.step = step;
      d.href = href;
      setHint({ step, href });
    }
    const travel = -d.step * dx;
    const progress = Math.max(0, Math.min(1, travel / DISTANCE));
    moveChip(progress, false);
    setArmed(progress >= 1);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.step === null) return reset();
    const travel = -d.step * (e.clientX - d.x);
    const velocity = travel / Math.max(1, e.timeStamp - d.time);
    if (travel >= DISTANCE || (travel >= MIN_FLICK && velocity >= VELOCITY)) {
      // the lifted finger can still produce a click on whatever it ended over
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
      router.push(d.href, { transitionTypes: [d.step === 1 ? 'nav-forward' : 'nav-back'] });
    }
    reset();
  };

  const target = hint ? labelFor(hint.href) : '';
  return (
    <div
      className={className}
      style={{ touchAction: 'pan-y pinch-zoom' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
    >
      {children}
      <div
        ref={chipRef}
        aria-hidden
        className={cx(
          'pointer-events-none fixed top-1/2 z-40 -mt-5 lg:hidden',
          hint?.step === -1 ? 'left-3' : 'right-3',
          !hint && 'invisible',
        )}
        style={{
          translate: `calc((1 - var(--p, 0)) * ${hint?.step === -1 ? '-' : ''}120%) 0`,
          opacity: 'var(--p, 0)',
        }}
        onTransitionEnd={() => {
          if (!drag.current) setHint(null);
        }}
      >
        <span
          className={cx(
            'flex h-10 items-center gap-1.5 rounded border-2 px-3.5 text-sm font-semibold shadow-[3px_3px_0_0_var(--cast)] transition-[background-color,border-color,color,scale] duration-[var(--dur-fast)] ease-[var(--ease-standard)]',
            armed ? 'scale-105 border-ink bg-sun text-[#151515]' : 'border-ink bg-surface text-ink',
          )}
        >
          {hint?.step === -1 && <ArrowLeft aria-hidden className="size-4" />}
          {target}
          {hint?.step === 1 && <ArrowRight aria-hidden className="size-4" />}
        </span>
      </div>
    </div>
  );
}

function swallow(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}
