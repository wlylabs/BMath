'use client';

import { useEffect } from 'react';
import { cleanUrl } from '../lib/urlState';

/** Calculators keep their own copy of a shared link's query; drop it from the address bar. */
export function UrlCleaner() {
  useEffect(() => cleanUrl(), []);
  return null;
}
