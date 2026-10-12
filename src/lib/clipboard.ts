export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers and non-secure contexts
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Native share sheet on touch devices, clipboard everywhere else. A `text` goes in front of the link. */
export async function shareLink(url: string, title: string, text?: string): Promise<'shared' | 'copied' | 'failed'> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share(text ? { title, text, url } : { title, url });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared';
    }
  }
  return (await copyText(text ? `${text} ${url}` : url)) ? 'copied' : 'failed';
}
