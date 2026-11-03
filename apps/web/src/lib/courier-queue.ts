'use client';

import type { CourierDeliveriesResponse, DeliverySyncResult } from '@myabeshop/shared/client';
import { api } from './api';

/** One tap in the courier app, kept until the server has acknowledged it. */
export interface QueuedAction {
  id: string;
  storeId: string;
  orderId: string;
  orderNumber: number;
  status: 'DELIVERED' | 'REFUSED' | 'POSTPONED';
  reason?: string;
  postponedTo?: string;
  at: string;
  error?: string;
}

const QUEUE = 'myabe.courier.queue';
const CACHE = 'myabe.courier.cache.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: actions stay in memory for this session */
  }
}

let memoryQueue: QueuedAction[] | null = null;

export const courierStore = {
  queue(): QueuedAction[] {
    memoryQueue ??= read<QueuedAction[]>(QUEUE, []);
    return memoryQueue;
  },
  setQueue(q: QueuedAction[]) {
    memoryQueue = q;
    write(QUEUE, q);
  },
  push(a: Omit<QueuedAction, 'id' | 'at'>): QueuedAction {
    const action: QueuedAction = { ...a, id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString() };
    this.setQueue([...this.queue(), action]);
    return action;
  },
  cached(storeId: string): CourierDeliveriesResponse | null {
    return read<CourierDeliveriesResponse | null>(CACHE + storeId, null);
  },
  saveCache(storeId: string, data: CourierDeliveriesResponse) {
    write(CACHE + storeId, data);
  },
};

/** Applies the pending actions on top of the last server copy, so the list matches what the courier did. */
export function withPending(data: CourierDeliveriesResponse, queue: QueuedAction[]): CourierDeliveriesResponse {
  const pending = new Map(queue.filter((a) => !a.error).map((a) => [a.orderId, a]));
  let cash = data.courier?.cashBalance ?? 0;
  let delivered = data.courier?.deliveredToday ?? 0;
  const orders = data.orders.flatMap((o) => {
    const a = pending.get(o.id);
    if (!a) return [o];
    if (a.status === 'DELIVERED') {
      cash += o.total;
      delivered += 1;
      return [];
    }
    if (a.status === 'REFUSED') return [];
    return [{ ...o, status: 'POSTPONED' as const, postponedTo: a.postponedTo ?? o.postponedTo }];
  });
  return { ...data, orders, courier: data.courier ? { ...data.courier, cashBalance: cash, deliveredToday: delivered } : null };
}

/**
 * Sends the queue for one store. Network failures keep everything queued; actions refused by
 * the server (order reassigned, already delivered…) are kept with their error so the courier sees them.
 */
export async function flush(storeId: string): Promise<{ data: CourierDeliveriesResponse | null; sent: number; failed: number }> {
  const all = courierStore.queue();
  const mine = all.filter((a) => a.storeId === storeId && !a.error);
  if (mine.length === 0) return { data: null, sent: 0, failed: 0 };
  const res = await api.post<DeliverySyncResult>(`/stores/${storeId}/deliveries/sync`, {
    actions: mine.map(({ id, orderId, status, reason, postponedTo, at }) => ({ id, orderId, status, reason, postponedTo, at })),
  });
  const byId = new Map(res.results.map((r) => [r.id, r]));
  let failed = 0;
  const next = courierStore.queue().flatMap((a) => {
    const r = byId.get(a.id);
    if (!r) return [a];
    if (r.ok) return [];
    failed++;
    return [{ ...a, error: r.message ?? r.error ?? 'Refusé' }];
  });
  courierStore.setQueue(next);
  courierStore.saveCache(storeId, res.deliveries);
  return { data: res.deliveries, sent: mine.length - failed, failed };
}
