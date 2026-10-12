export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  /** Playing its exit; removed once that finishes. */
  leaving?: boolean;
}

/** Matches the exit animation in globals.css (Sonner's TIME_BEFORE_UNMOUNT). */
export const TOAST_EXIT_MS = 200;

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

/** Shows a short status message. Pass duration Infinity for one that waits for an action. */
export function toast(message: string, opts: { action?: ToastAction; duration?: number } = {}): number {
  const id = ++seq;
  items = [...items.filter((i) => i.message !== message), { id, message, action: opts.action }];
  emit();
  const duration = opts.duration ?? 2800;
  if (Number.isFinite(duration)) setTimeout(() => dismissToast(id), duration);
  return id;
}

export function dismissToast(id: number) {
  const item = items.find((i) => i.id === id);
  if (!item || item.leaving) return;
  items = items.map((i) => (i.id === id ? { ...i, leaving: true } : i));
  emit();
  setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, TOAST_EXIT_MS);
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getToasts(): ToastItem[] {
  return items;
}

const EMPTY: ToastItem[] = [];
export function getServerToasts(): ToastItem[] {
  return EMPTY;
}
