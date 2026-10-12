'use client';

import { Check } from 'lucide-react';
import { PixelIcon } from './PixelIcon';
import { t } from '../lib/copy';
import { shareLink } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { useFlash } from './ui';

export function ShareButton({ getUrl }: { getUrl: () => string }) {
  const [done, flash] = useFlash();
  return (
    <button
      type="button"
      onClick={async () => {
        const result = await shareLink(getUrl(), t.share.title);
        if (result === 'copied') toast(t.share.copied);
        else if (result === 'failed') toast(t.share.failed);
        // the native share sheet is its own confirmation
        if (result === 'copied') flash();
      }}
      aria-label={t.share.label}
      title={t.share.label}
      className="btn btn-sm shrink-0 !min-h-9 text-[13px]"
    >
      {done ? (
        <Check aria-hidden key="done" className="icon-in size-3.5 text-pos" />
      ) : (
        <PixelIcon name="share" key="share" className="size-3.5" />
      )}
      {t.share.button}
    </button>
  );
}
