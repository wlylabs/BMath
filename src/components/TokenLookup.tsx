'use client';

import { useCallback, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { getLaunch, MINT_RE, searchLaunches, type Launch } from '../api/bordrless';
import { compactUsd, pct, shortAddress, time } from '../lib/format';
import { bordrlessTokenUrl, OUR_TOKEN } from '../lib/site';
import { t } from '../lib/copy';
import { cx } from '../lib/cx';
import { LiveBadge, SwapValue } from './ui';
import { PixelIcon } from './PixelIcon';
import { Logo } from './Logo';

function TokenArt({ token, size = 40 }: { token: Pick<Launch, 'image' | 'symbol'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (token.image && !failed) {
    return (
      // launch art lives on IPFS gateways, and image optimization is off in the static export
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.image}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 border border-line-strong bg-surface-2 object-cover [image-rendering:pixelated]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="num flex shrink-0 items-center justify-center border border-line-strong bg-surface-2 text-xs font-semibold text-ink-2"
      style={{ width: size, height: size }}
    >
      {token.symbol.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Rules of a launch, the way bordrless.app's cards list them. */
export function rulesSummary(l: Pick<Launch, 'rules'>): string[] {
  const r = l.rules;
  const p = (bps: number) => pct(bps / 10_000, { digits: bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2 });
  const out: string[] = [];
  if (r.creatorFeeBps) out.push(`${t.common.creatorFee} ${p(r.creatorFeeBps)}`);
  const holders = r.holderFeeBuyBps === r.holderFeeSellBps ? p(r.holderFeeBuyBps) : `${p(r.holderFeeBuyBps)} / ${p(r.holderFeeSellBps)}`;
  if (r.holderFeeBuyBps || r.holderFeeSellBps) out.push(`${t.fee.holders} ${holders}`);
  const burn = r.burnBuyBps === r.burnSellBps ? p(r.burnBuyBps) : `${p(r.burnBuyBps)} / ${p(r.burnSellBps)}`;
  if (r.burnBuyBps || r.burnSellBps) out.push(`${t.fee.burn} ${burn}`);
  return out;
}

/**
 * Pick a Bordrless launch by name, ticker or mint. The picked token keeps refreshing every
 * minute while the tab is visible, so its pool and market cap stay current.
 */
export function TokenLookup(props: { token: Launch | null; onChange: (t: Launch | null) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ q: string; ok: boolean; results: Launch[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loadingPick, setLoadingPick] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const listId = useId();
  const inputId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { token, onChange } = props;

  const q = query.trim();
  const settled = search?.q === q ? search : null;
  const status: 'loading' | 'error' | 'done' = !settled ? 'loading' : settled.ok ? 'done' : 'error';
  const results = settled?.results ?? [];

  useEffect(() => {
    if (!open || token) return;
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        searchLaunches(q, ctrl.signal)
          .then((r) => {
            setSearch({ q, ok: true, results: r });
            setActive(0);
          })
          .catch((e: unknown) => {
            if ((e as Error).name !== 'AbortError') setSearch({ q, ok: false, results: [] });
          });
      },
      q ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, open, token]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      setRefreshing(true);
      try {
        const fresh = await getLaunch(token.mint, signal);
        if (fresh) onChange(fresh);
        setRefreshError(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setRefreshError(true);
      } finally {
        setRefreshing(false);
      }
    },
    [token, onChange],
  );

  // fresh numbers when a saved token is restored, then every 60 s while the tab is visible
  const refreshFromEffect = useEffectEvent((signal: AbortSignal, onlyIfStale: boolean) => {
    if (onlyIfStale && Date.now() - (token?.fetchedAt ?? 0) <= 15_000) return;
    void refresh(signal);
  });
  const mint = token?.mint;
  useEffect(() => {
    if (!mint) return;
    const ctrl = new AbortController();
    const first = setTimeout(() => refreshFromEffect(ctrl.signal, true), 0);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshFromEffect(ctrl.signal, false);
    }, 60_000);
    return () => {
      ctrl.abort();
      clearTimeout(first);
      clearInterval(id);
    };
  }, [mint]);

  // the list only carries summaries; the pool reserves come with the launch itself
  const pick = async (l: Launch) => {
    setLoadingPick(l.mint);
    try {
      const full = (await getLaunch(l.mint)) ?? l;
      setSwapped(true);
      onChange(full);
      setQuery('');
      setOpen(false);
    } catch {
      setSwapped(true);
      onChange(l);
      setOpen(false);
    } finally {
      setLoadingPick(null);
    }
  };

  // one tap to try the calculator on BMath's own token
  const pickOurs = async () => {
    setLoadingPick(OUR_TOKEN.mint);
    try {
      const l = await getLaunch(OUR_TOKEN.mint);
      if (l) {
        setSwapped(true);
        onChange(l);
      }
    } catch {
      setSearch({ q, ok: false, results: [] });
      setOpen(true);
    } finally {
      setLoadingPick(null);
    }
  };

  if (token) {
    const rules = rulesSummary(token);
    return (
      <div className={cx('rounded border border-ink bg-surface-2 p-3.5 shadow-[2px_2px_0_0_var(--cast)]', swapped && 'enter')}>
        <div className="flex items-start gap-3">
          <TokenArt token={token} size={52} />
          <div className="min-w-0 flex-1">
            <p className="label flex items-center gap-1.5 text-ink-2">
              <span aria-hidden className={cx('inline-block size-2', token.status === 'graduated' ? 'bg-ink' : 'bg-green')} />
              {token.status === 'graduated' ? t.lookup.graduated : t.lookup.curve}
            </p>
            <p className="display mt-1 truncate text-[1.6rem] text-ink">{token.name}</p>
            <p className="label mt-1 truncate text-ink-2">
              <span className="font-semibold text-ink">{token.symbol}</span> · {shortAddress(token.mint)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSwapped(true);
              onChange(null);
            }}
            className="btn btn-icon btn-sm !size-9 !min-h-9 shrink-0"
            aria-label={t.lookup.clear}
            title={t.lookup.clear}
          >
            <PixelIcon name="close" className="size-3" />
          </button>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
          <div>
            <dt className="label text-muted">{t.common.mcap}</dt>
            <dd className="num text-[15px] font-semibold text-ink">
              <SwapValue value={compactUsd(token.mcapUsd)} />
            </dd>
          </div>
          <div>
            <dt className="label text-muted">{t.lookup.volume}</dt>
            <dd className="num text-[15px] font-semibold text-ink">{compactUsd(token.volume24hUsd)}</dd>
          </div>
          <div>
            <dt className="label text-muted">{t.lookup.holders}</dt>
            <dd className="num text-[15px] font-semibold text-ink">{token.holders.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt className="label text-muted">{t.lookup.fees}</dt>
            <dd className="num text-[15px] font-semibold text-ink">
              {token.buyFeeBps === token.sellFeeBps
                ? pct(token.buyFeeBps / 10_000)
                : `${pct(token.buyFeeBps / 10_000)} / ${pct(token.sellFeeBps / 10_000)}`}
            </dd>
          </div>
        </dl>
        {token.status === 'curve' && (
          <div className="mt-3">
            <div className="h-2 border border-ink bg-surface" aria-hidden>
              <div className="h-full bg-green" style={{ width: `${Math.min(100, token.progress * 100)}%` }} />
            </div>
            <p className="label mt-1 text-muted">{t.lookup.progress(pct(token.progress, { digits: 1 }))}</p>
          </div>
        )}
        {rules.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {rules.map((r) => (
              <li key={r} className="label border border-line-strong bg-surface px-1.5 py-1 text-ink-2">
                {r}
              </li>
            ))}
          </ul>
        )}
        <div className="label mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-muted">
          <span className="flex items-center gap-2">
            <LiveBadge label={t.common.live} />
            {refreshError ? t.lookup.refreshError : t.lookup.refreshed(time(token.fetchedAt))}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="press inline-flex h-8 items-center gap-1.5 px-2 font-medium text-ink-2 hover:text-ink disabled:opacity-60"
            >
              <RefreshCw aria-hidden className={cx('size-3.5', refreshing && 'animate-spin')} />
              {t.lookup.refresh}
            </button>
            <a
              href={bordrlessTokenUrl(token.mint)}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-8 items-center gap-1.5 px-2 font-medium text-ink-2 hover:text-ink"
            >
              {t.lookup.open}
              <PixelIcon name="external" className="size-3" />
            </a>
          </span>
        </div>
      </div>
    );
  }

  const showList = open;
  return (
    <div ref={wrapRef} className={cx('relative', swapped && 'enter')}>
      <label htmlFor={inputId} className="sr-only">
        {t.lookup.label}
      </label>
      <div className="flex h-12 items-center rounded border border-line bg-surface-2 transition-colors focus-within:border-ink focus-within:bg-raised focus-within:shadow-[inset_0_0_0_1px_var(--ink)] hover:border-line-strong">
        <PixelIcon name="search" className="ml-3.5 size-4 text-muted" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          placeholder={t.lookup.placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return setOpen(false);
            if (e.key === 'Enter' && MINT_RE.test(q) && results.length === 0) {
              e.preventDefault();
              void getLaunch(q).then((l) => l && pick(l));
              return;
            }
            if (!showList || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const r = results[active];
              if (r) void pick(r);
            }
          }}
          className="h-full w-full min-w-0 bg-transparent px-2.5 text-base text-ink outline-none placeholder:text-muted/80 [&::-webkit-search-cancel-button]:hidden"
        />
        {(status === 'loading' && open) || loadingPick ? <Loader2 aria-hidden className="mr-3.5 size-4 shrink-0 animate-spin text-muted" /> : null}
      </div>
      {!showList && (
        <button
          type="button"
          onClick={() => void pickOurs()}
          disabled={loadingPick !== null}
          className="press label mt-2 inline-flex items-center gap-2 rounded-sm border border-ink bg-sun px-2 py-1.5 font-semibold text-[#151515] shadow-[2px_2px_0_0_var(--cast)] disabled:opacity-60"
        >
          <Logo className="size-4" />
          {t.lookup.tryOurs(OUR_TOKEN.symbol)}
          {loadingPick === OUR_TOKEN.mint && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
        </button>
      )}
      {showList && (
        <div className="pop-in absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--cast)]">
          {!q && <p className="label border-b border-line px-3.5 py-2 text-muted">{t.lookup.top}</p>}
          {status === 'error' ? (
            <p className="px-4 py-3 text-sm text-ink-2">{t.lookup.error}</p>
          ) : status === 'loading' && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">{t.lookup.searching}</p>
          ) : status === 'done' && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">{t.lookup.none}</p>
          ) : (
            <ul id={listId} role="listbox" aria-label={t.lookup.label} className="max-h-80 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li
                  key={r.mint}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => void pick(r)}
                  className={cx('flex cursor-pointer items-center gap-3 px-3.5 py-2.5', i === active && 'bg-surface-2')}
                >
                  <TokenArt token={r} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{r.name}</span>
                    <span className="label block truncate text-muted">
                      {r.symbol} · {r.status === 'graduated' ? t.lookup.graduated : t.lookup.curve}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-sm font-semibold text-ink">{compactUsd(r.mcapUsd)}</span>
                    <span className="label block text-muted">
                      {t.lookup.fees} {pct(Math.max(r.buyFeeBps, r.sellFeeBps) / 10_000, { digits: 1 })}
                    </span>
                  </span>
                  {loadingPick === r.mint && <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-muted" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
