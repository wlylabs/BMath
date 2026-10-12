import { ChevronDown } from 'lucide-react';
import { t } from '../lib/copy';
import { ROUTES } from '../lib/routes';
import { BORDRLESS_URL, CREATOR } from '../lib/site';
import { Logo } from './Logo';
import { NavLink } from './NavLink';
import { InstallButton } from './pwa/PwaProvider';
import { PixelIcon } from './PixelIcon';

export function Methodology() {
  const blocks: { id: string; title: string; body: string; note?: string }[] = [
    { id: 'order', title: t.method.orderTitle, body: t.method.orderBody },
    { id: 'fee', title: t.method.feeTitle, body: t.method.feeBody },
    { id: 'share', title: t.method.shareTitle, body: t.method.shareBody, note: t.method.shareSource },
    { id: 'sniper', title: t.method.sniperTitle, body: t.method.sniperBody },
    { id: 'holders', title: t.method.holdersTitle, body: t.method.holdersBody },
    { id: 'curve', title: t.method.curveTitle, body: t.method.curveBody },
    { id: 'half-life', title: t.method.halfLifeTitle, body: t.method.halfLifeBody },
    { id: 'limits', title: t.method.limitsTitle, body: t.method.limitsBody },
  ];
  return (
    <section className="mx-auto max-w-[1360px] px-4 pb-12 pt-8 sm:px-6 lg:pb-16 lg:pt-12" aria-labelledby="method-title">
      <span className="tag">
        <PixelIcon name="book" className="size-3" />
        {t.nav.method}
      </span>
      <h1 id="method-title" className="display mt-4 text-5xl text-ink sm:text-7xl">
        {t.method.title}
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{t.method.lead}</p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {blocks.map((b, i) => (
          <article key={b.id} id={b.id} className="card scroll-mt-24 p-5 sm:p-6">
            <h2 className="display flex items-start gap-3 text-[1.75rem] text-ink">
              <span className="num mt-1 flex size-6 shrink-0 items-center justify-center bg-deep text-xs font-normal tracking-normal text-on-deep">{i + 1}</span>
              {b.title}
            </h2>
            <p className="mt-2 leading-relaxed text-ink-2">{b.body}</p>
            {b.note && <p className="label mt-3 border-t border-line pt-2 text-muted">{b.note}</p>}
          </article>
        ))}
      </div>

      <div id="sources" className="mt-10 scroll-mt-24">
        <h2 className="display text-4xl text-ink">{t.method.sourcesTitle}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.method.sources.map((src) => (
            <li key={src.href}>
              <a
                href={src.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn w-full !justify-between !whitespace-normal py-3 text-left text-[15px]"
              >
                {src.label}
                <PixelIcon name="external" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-12 pt-8 sm:px-6 lg:pb-16 lg:pt-12" aria-labelledby="faq-title">
      <span className="tag">
        <PixelIcon name="faq" className="size-3" />
        {t.nav.faq}
      </span>
      <h1 id="faq-title" className="display mt-4 text-5xl text-ink sm:text-7xl">
        {t.faq.title}
      </h1>
      <div className="card mt-8 divide-y divide-line px-4 sm:px-6">
        {t.faq.items.map((item) => (
          <details key={item.q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {item.q}
              <ChevronDown
                aria-hidden
                className="size-5 shrink-0 text-ink transition-transform duration-[var(--dur-base)] ease-[var(--ease-standard)] group-open:rotate-180"
              />
            </summary>
            <p className="pb-5 pr-8 leading-relaxed text-ink-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  const links = [
    { href: ROUTES.fee, label: t.calc.tabs.fee },
    { href: ROUTES.profit, label: t.calc.tabs.profit },
    { href: ROUTES.earn, label: t.calc.tabs.earn },
    { href: ROUTES.methodology, label: t.nav.method },
    { href: ROUTES.faq, label: t.nav.faq },
  ];
  return (
    <footer
      style={{ viewTransitionName: 'site-footer' }}
      className="border-t-2 border-ink pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-10 lg:pb-10"
    >
      <div className="mx-auto grid max-w-[1360px] gap-8 px-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="display text-3xl text-ink">BMath</span>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-2">{t.footer.about}</p>
          <a
            href={CREATOR.url}
            target="_blank"
            rel="noopener noreferrer"
            className="label mt-4 inline-flex items-center gap-1.5 text-ink-2 hover:text-ink"
          >
            {CREATOR.name} · {CREATOR.handle}
            <PixelIcon name="external" className="size-3" />
          </a>
        </div>
        <nav aria-label={t.footer.nav} className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[15px] md:flex md:flex-col">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} className="font-medium text-ink-2 hover:text-ink">
              {l.label}
            </NavLink>
          ))}
          <a href={BORDRLESS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
            {t.footer.bordrless}
            <PixelIcon name="external" className="size-3" />
          </a>
          <InstallButton variant="text" />
        </nav>
      </div>
      <div className="label mx-auto mt-8 max-w-[1360px] border-t border-line px-4 pt-6 text-muted sm:px-6">
        {t.footer.copyright(new Date().getUTCFullYear(), CREATOR.name)}
      </div>
    </footer>
  );
}
