'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Download, Share, SquarePlus, X } from 'lucide-react';
import { t } from '../../lib/copy';
import { dismissToast, toast } from '../../lib/toast';
import { PixelIcon } from '../PixelIcon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Captured by the inline head script in case it fires before hydration. */
    __bmathInstall?: BeforeInstallPromptEvent;
  }
}

interface PwaValue {
  canInstall: boolean;
  install: () => void;
}

const PwaContext = createContext<PwaValue>({ canInstall: false, install: () => {} });

export function usePwa(): PwaValue {
  return useContext(PwaContext);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/* Install state lives outside React: the browser hands over the prompt whenever it likes. */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
let wired = false;

function notifyInstall() {
  installListeners.forEach((l) => l());
}

function wireInstallEvents() {
  if (wired) return;
  wired = true;
  deferredPrompt = window.__bmathInstall ?? null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedNow = true;
    notifyInstall();
    toast(t.pwa.installed);
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', notifyInstall);
}

function subscribeInstall(listener: () => void) {
  wireInstallEvents();
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

function canInstallNow(): boolean {
  return !installedNow && !isStandalone() && (deferredPrompt !== null || isIos());
}

/**
 * Install prompt, service worker updates and the offline notice. Rendered once
 * around the page; the service worker only registers in production builds.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const canInstall = useSyncExternalStore(subscribeInstall, canInstallNow, () => false);
  const iosDialog = useRef<HTMLDialogElement>(null);

  // Offline notice stays up until the connection returns.
  useEffect(() => {
    let id: number | null = null;
    const offline = () => {
      if (id === null) id = toast(t.pwa.offline, { duration: Infinity });
    };
    const online = () => {
      if (id !== null) dismissToast(id);
      id = null;
    };
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let reloadOnSwap = false;
    const onControllerChange = () => {
      // the first install also changes controller; only reload when the user asked for the update
      if (reloadOnSwap) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const offerUpdate = (worker: ServiceWorker) =>
      toast(t.pwa.update, {
        duration: Infinity,
        action: {
          label: t.pwa.reload,
          onClick: () => {
            reloadOnSwap = true;
            worker.postMessage('SKIP_WAITING');
          },
        },
      });

    let registration: ServiceWorkerRegistration | undefined;
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    };
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
          });
        });
      })
      .catch(() => {});
    document.addEventListener('visibilitychange', checkForUpdate);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdate);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredPrompt;
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      deferredPrompt = null;
      window.__bmathInstall = undefined;
      if (outcome === 'accepted') installedNow = true;
      notifyInstall();
      return;
    }
    if (isIos()) iosDialog.current?.showModal();
  }, []);

  return (
    <PwaContext.Provider value={{ canInstall, install }}>
      {children}
      <dialog
        ref={iosDialog}
        aria-labelledby="ios-install-title"
        className="sheet m-auto w-[calc(100%-2rem)] max-w-sm rounded-md border-2 border-ink bg-surface p-0 text-ink shadow-[4px_4px_0_0_var(--cast)] max-sm:mb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="ios-install-title" className="display text-2xl">
              {t.pwa.iosTitle}
            </h2>
            <button
              type="button"
              onClick={() => iosDialog.current?.close()}
              aria-label={t.pwa.close}
              className="press -mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-lg text-muted hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <ol className="mt-4 space-y-3 text-sm text-ink-2">
            {t.pwa.iosSteps.map((step, i) => {
              const Icon = i === 0 ? Share : i === 1 ? SquarePlus : Download;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  {step}
                </li>
              );
            })}
          </ol>
        </div>
      </dialog>
    </PwaContext.Provider>
  );
}

export function InstallButton({ variant = 'icon' }: { variant?: 'icon' | 'text' }) {
  const { canInstall, install } = usePwa();
  if (!canInstall) return null;
  if (variant === 'text') {
    return (
      <button type="button" onClick={install} className="press inline-flex items-center gap-1.5 text-left text-ink-2 hover:text-ink">
        <PixelIcon name="install" className="size-3.5" />
        {t.footer.install}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={install}
      aria-label={t.header.install}
      title={t.header.install}
      // appears after hydration (the browser offers install late), so it fades in instead of popping
      className="btn btn-icon pop-in hidden sm:inline-flex"
    >
      <PixelIcon name="install" className="size-[18px]" />
    </button>
  );
}
