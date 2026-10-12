import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';
import { takeUrlState } from '../lib/urlState';

const PREFIX = 'bmath:';

/** Raw JSON per key. Mirrors localStorage and keeps working when storage is blocked. */
const memory = new Map<string, string>();
/** Parsed value per key, reused while the raw JSON is unchanged so snapshots stay stable. */
const parsed = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Map<string, Set<() => void>>();

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function rawFor(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function decode<T>(raw: string | null, initial: T): T {
  if (raw === null) return initial;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isRecord(initial)) return (isRecord(value) ? { ...initial, ...value } : initial) as T;
    return typeof value === typeof initial ? (value as T) : initial;
  } catch {
    return initial;
  }
}

function snapshot<T>(key: string, initial: T): T {
  const raw = rawFor(key);
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = decode(raw, initial);
  parsed.set(key, { raw, value });
  return value;
}

function store(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  parsed.set(key, { raw, value });
  try {
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    /* private mode or storage full: the in-memory copy keeps the app working */
  }
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  // another tab changed the same input
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PREFIX + key) return;
    memory.delete(key);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

interface UrlBinding<T> {
  /** Page whose shared links carry this state, e.g. ROUTES.fee. */
  page: string;
  fromUrl: (params: URLSearchParams) => Partial<T> | T | undefined;
}

/** A shared link overrides the saved value once, before the first client read. */
function applyUrl<T>(key: string, initial: T, url: UrlBinding<T> | undefined) {
  if (!url || typeof window === 'undefined') return;
  const params = takeUrlState(url.page, key);
  if (!params) return;
  const patch = url.fromUrl(params);
  if (patch === undefined) return;
  const current = snapshot(key, initial);
  store(key, isRecord(current) && isRecord(patch) ? { ...current, ...patch } : patch);
}

/**
 * useState that survives reloads and stays in sync across tabs. The server and
 * the hydrating client render `initial`, so the prerendered HTML matches; the
 * saved value takes over right after hydration.
 */
export function usePersistentState<T>(key: string, initial: T, url?: UrlBinding<T>) {
  applyUrl(key, initial, url);
  const value = useSyncExternalStore(
    useCallback((l: () => void) => subscribe(key, l), [key]),
    () => snapshot(key, initial),
    () => initial,
  );
  const setValue = useCallback(
    (action: SetStateAction<T>) => {
      const prev = snapshot(key, initial);
      store(key, typeof action === 'function' ? (action as (p: T) => T)(prev) : action);
    },
    [key, initial],
  );
  return [value, setValue] as const;
}
