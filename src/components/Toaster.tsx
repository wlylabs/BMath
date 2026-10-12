'use client';

import { useRef, useSyncExternalStore, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { dismissToast, getServerToasts, getToasts, subscribeToasts, TOAST_EXIT_MS, type ToastItem } from '../lib/toast';

// Swipe-to-dismiss constants from Sonner: 45px or a flick faster than 0.11 px/ms.
const SWIPE_THRESHOLD = 45;
const SWIPE_VELOCITY = 0.11;

/** Sonner's resistance for dragging the wrong way: the further, the stiffer. */
const dampen = (delta: number) => delta / (1.5 + Math.abs(delta) / 20);

export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4"
    >
      {items.map((item) => (
        <Toast key={item.id} item={item} />
      ))}
    </div>
  );
}

interface Drag {
  id: number;
  x: number;
  y: number;
  time: number;
  axis: 'x' | 'y' | null;
}

/** One toast. Swipe it up or sideways to dismiss. */
function Toast({ item }: { item: ToastItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const place = (x: number, y: number, opacity: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate
      ? `translate ${TOAST_EXIT_MS}ms var(--ease-exit), opacity ${TOAST_EXIT_MS}ms var(--ease-exit)`
      : 'none';
    el.style.translate = `${x}px ${y}px`;
    el.style.opacity = String(opacity);
  };

  const settle = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'translate var(--dur-base) var(--ease-drawer), opacity var(--dur-base) var(--ease-drawer)';
    el.style.translate = '';
    el.style.opacity = '';
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (item.leaving || e.button !== 0) return;
    // buttons keep their tap
    if (e.target instanceof Element && e.target.closest('button')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, axis: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    const width = e.currentTarget.offsetWidth || 1;
    if (d.axis === 'x') place(dx, 0, 1 - Math.min(0.6, Math.abs(dx) / width), false);
    // toasts sit at the top, so only up dismisses; down resists
    else place(0, dy < 0 ? dy : dampen(dy), 1, false);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.axis) return;
    const delta = d.axis === 'x' ? e.clientX - d.x : e.clientY - d.y;
    const travel = d.axis === 'x' ? Math.abs(delta) : -delta;
    const velocity = travel / Math.max(1, e.timeStamp - d.time);
    if (travel >= SWIPE_THRESHOLD || (travel > 0 && velocity > SWIPE_VELOCITY)) {
      const width = e.currentTarget.offsetWidth;
      const height = e.currentTarget.offsetHeight;
      if (d.axis === 'x') place(Math.sign(delta) * (width + 32), 0, 0, true);
      else place(0, -(height + 32), 0, true);
      dismissToast(item.id);
    } else {
      settle();
    }
  };

  return (
    <div
      ref={ref}
      data-leaving={item.leaving || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        settle();
      }}
      className={cx(
        'toast pointer-events-auto flex w-full max-w-md touch-none select-none items-center gap-3 rounded border-2 border-ink bg-surface px-4 py-3 text-sm font-medium text-ink shadow-[3px_3px_0_0_var(--cast)]',
        item.leaving && 'pointer-events-none',
      )}
    >
      <span className="min-w-0 flex-1">{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
          className="btn btn-sun btn-sm !min-h-8 shrink-0 text-xs"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label="Dismiss"
        className="press -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
