'use client';

import { useEffect } from 'react';

/** The courier view moved to the offline-capable app at /livreur. */
export default function DeliveriesRedirect() {
  useEffect(() => {
    window.location.replace('/livreur');
  }, []);
  return null;
}
