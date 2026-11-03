'use client';

import { useEffect } from 'react';
import type { PublicStoreDto } from '@myabeshop/shared/client';

type W = Window & { fbq?: (...a: unknown[]) => void; _fbq?: unknown; ttq?: { load: (id: string) => void; page: () => void; track: (e: string, d?: object, o?: object) => void } & unknown[] };

export interface PixelEvent {
  name: 'ViewContent' | 'InitiateCheckout' | 'Purchase';
  value?: number;
  currency?: string;
  contentId?: string;
  contentName?: string;
  /** Same id on browser and server events lets Meta / TikTok deduplicate. */
  eventId?: string;
}

/**
 * Meta and TikTok pixels (§8.4). Loaded after the page is idle so they never slow down
 * the product page on 3G; only present when the merchant's plan includes pixels.
 */
export function Pixels({ pixels: maybe, event }: { pixels?: PublicStoreDto['pixels']; event?: PixelEvent }) {
  const pixels = maybe ?? { metaPixelId: null, tiktokPixelId: null };
  useEffect(() => {
    if (!pixels.metaPixelId && !pixels.tiktokPixelId) return;
    const w = window as W;
    const start = () => {
      if (pixels.metaPixelId && !w.fbq) {
        /* eslint-disable */
        (function (f: any, b: Document, e: string, v: string) {
          if (f.fbq) return;
          const n: any = (f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
          if (!f._fbq) f._fbq = n;
          n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v;
          b.head.appendChild(t);
        })(w, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        w.fbq!('init', pixels.metaPixelId);
        w.fbq!('track', 'PageView');
      }
      if (pixels.tiktokPixelId && !w.ttq) {
        /* eslint-disable */
        const ttq: any = (w.ttq = [] as any);
        ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
        ttq.setAndDefer = (t: any, e: string) => { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
        for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
        ttq.load = (id: string) => {
          const s = document.createElement('script'); s.async = true;
          s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`;
          document.head.appendChild(s);
        };
        /* eslint-enable */
        w.ttq!.load(pixels.tiktokPixelId);
        w.ttq!.page();
      }
      if (event) fire(event);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
    if (idle) idle(start, { timeout: 3000 });
    else setTimeout(start, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixels.metaPixelId, pixels.tiktokPixelId]);
  return null;
}

/** Sends a standard event to whichever pixels are loaded. */
export function fire(e: PixelEvent) {
  const w = window as W;
  const data = { value: e.value, currency: e.currency, content_ids: e.contentId ? [e.contentId] : undefined, content_name: e.contentName, content_type: 'product' };
  w.fbq?.('track', e.name, data, e.eventId ? { eventID: e.eventId } : undefined);
  const tt = e.name === 'Purchase' ? 'CompletePayment' : e.name;
  w.ttq?.track?.(tt, { value: e.value, currency: e.currency, content_id: e.contentId, content_type: 'product' }, e.eventId ? { event_id: e.eventId } : undefined);
}
