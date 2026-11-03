'use client';

import { useEffect } from 'react';

/** Installs the offline service worker (production builds only, to keep dev hot reload clean). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
  return null;
}
