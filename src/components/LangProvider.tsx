'use client';

import { createContext, Fragment, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { LANG_LABELS, LANGS, setLang, type Lang } from '../lib/copy';
import { cx } from '../lib/cx';

const KEY = 'bmath:lang';

function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === 'id' ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

const LangContext = createContext<{ lang: Lang; change: (l: Lang) => void }>({ lang: 'en', change: () => {} });

/**
 * Holds the interface language. The static export is English; a saved choice
 * applies right after hydration, while the inline script in the layout keeps
 * the page hidden (html.lang-pending) so English does not flash first.
 * Changing the language remounts the app so every `t` read sees it; inputs
 * survive because they are saved on the device.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  // set before the subtree renders, so every `t` read in this render pass gets this language
  setLang(lang);

  useEffect(() => {
    // the saved choice can only be read after hydration, which renders the exported English first
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored() !== 'en') setLangState(stored());
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === stored()) document.documentElement.classList.remove('lang-pending');
  }, [lang]);

  const change = useCallback((next: Lang) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    setLangState(next);
  }, []);

  return (
    <LangContext value={{ lang, change }}>
      <Fragment key={lang}>{children}</Fragment>
    </LangContext>
  );
}

/** EN / ID switch for the header. */
export function LangToggle() {
  const { lang, change } = useContext(LangContext);
  return (
    <div role="radiogroup" aria-label="Language / Bahasa" className="flex h-10 items-center gap-0.5 rounded border border-ink bg-surface p-0.5 shadow-[3px_3px_0_0_var(--cast)]">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          lang={l}
          onClick={() => change(l)}
          className={cx(
            'label h-full rounded-sm px-2 font-semibold',
            lang === l ? 'bg-deep text-on-deep' : 'text-muted hover:text-ink',
          )}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
