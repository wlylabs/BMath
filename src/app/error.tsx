'use client';

import { RotateCcw } from 'lucide-react';
import { Logo } from '../components/Logo';
import { t } from '../lib/copy';

export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <Logo className="size-16" />
      <h1 className="display mt-8 text-5xl text-ink">{t.error.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.error.body}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="btn btn-ink mt-8"
      >
        <RotateCcw aria-hidden className="size-4" />
        {t.error.retry}
      </button>
    </div>
  );
}
