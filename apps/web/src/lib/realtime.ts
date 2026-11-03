'use client';

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import type { OrderSummaryDto } from '@myabeshop/shared/client';
import { API_URL, session } from './api';

/** Short two-tone chime generated with WebAudio (no audio file to download). */
export function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.15 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.32);
    });
  } catch {
    /* audio blocked */
  }
}

/** Subscribes to new / updated orders of the current store (§6.1: instant notification). */
export function useStoreEvents(
  storeId: string | null | undefined,
  handlers: { onCreated?: (o: OrderSummaryDto) => void; onUpdated?: (o: OrderSummaryDto) => void },
) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!storeId) return;
    const socket = io(`${API_URL}/realtime`, {
      auth: (cb) => cb({ token: session.accessToken }),
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => socket.emit('join', { storeId }));
    socket.on('order.created', (o: OrderSummaryDto) => ref.current.onCreated?.(o));
    socket.on('order.updated', (o: OrderSummaryDto) => ref.current.onUpdated?.(o));
    return () => {
      socket.close();
    };
  }, [storeId]);
}
