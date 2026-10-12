'use client';

import Link from 'next/link';
import { Logo } from './Logo';
import { t } from '../lib/copy';
import { ROUTES } from '../lib/routes';

export function NotFoundBody() {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <Logo className="size-16" />
      <p className="num mt-8 text-sm text-muted">404</p>
      <h1 className="display mt-2 text-5xl text-ink">{t.notFound.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.notFound.body}</p>
      <Link
        href={ROUTES.fee}
        className="btn btn-ink mt-8"
      >
        {t.notFound.cta}
      </Link>
    </div>
  );
}
