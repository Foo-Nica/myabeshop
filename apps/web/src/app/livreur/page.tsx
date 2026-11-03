'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney, type CourierDeliveriesResponse, type CourierDelivery, type MeResponse } from '@myabeshop/shared/client';
import { api, ApiError, session } from '@/lib/api';
import { courierStore, flush, withPending, type QueuedAction } from '@/lib/courier-queue';
import { Alert, Button, cx, Spinner } from '@/components/ui';
import { WhatsAppIcon } from '@/components/storefront/StoreHeader';

const REASONS = ['Client absent', 'Client injoignable', 'A changé d’avis', 'Pas l’argent', 'Adresse introuvable', 'Produit non conforme'];

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d;
}

/**
 * Courier PWA (§8.1): today's parcels sorted by area, call / WhatsApp / directions, one-tap
 * status. Works offline: the list is kept on the phone and every tap is queued, then sent
 * when the network comes back (the server ignores an action it has already applied).
 */
export default function CourierApp() {
  const online = useOnline();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [stores, setStores] = useState<MeResponse['memberships']>([]);
  const [server, setServer] = useState<CourierDeliveriesResponse | null>(null);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [sheet, setSheet] = useState<{ order: CourierDelivery; kind: 'REFUSED' | 'POSTPONED' } | null>(null);
  const [tab, setTab] = useState<'todo' | 'postponed'>('todo');

  // Who am I, and for which store do I deliver?
  useEffect(() => {
    if (!session.accessToken && !session.refreshToken) {
      window.location.href = '/livreur/connexion';
      return;
    }
    setQueue(courierStore.queue());
    api
      .get<MeResponse>('/auth/me')
      .then((me) => {
        const mine = me.memberships.filter((m) => m.role === 'COURIER');
        if (mine.length === 0) {
          window.location.href = '/dashboard';
          return;
        }
        setStores(mine);
        const saved = mine.find((m) => m.storeId === session.storeId) ?? mine[0]!;
        session.setStore(saved.storeId);
        setStoreId(saved.storeId);
      })
      .catch(() => {
        // Offline at start-up: reuse the last store and its cached parcels.
        const saved = session.storeId;
        if (saved) setStoreId(saved);
        else window.location.href = '/livreur/connexion';
      });
  }, []);

  useEffect(() => {
    if (storeId) setServer((s) => s ?? courierStore.cached(storeId));
  }, [storeId]);

  const refresh = useCallback(async () => {
    if (!storeId) return;
    setSyncing(true);
    try {
      const flushed = await flush(storeId);
      if (flushed.failed) setMessage({ tone: 'error', text: `${flushed.failed} action(s) refusée(s) par le serveur : voir ci-dessous.` });
      else if (flushed.sent) setMessage({ tone: 'success', text: `${flushed.sent} action(s) envoyée(s).` });
      const data = flushed.data ?? (await api.get<CourierDeliveriesResponse>(`/stores/${storeId}/deliveries/mine`));
      courierStore.saveCache(storeId, data);
      setServer(data);
      setLastSync(new Date().toISOString());
    } catch (e) {
      if (e instanceof ApiError) setMessage({ tone: 'error', text: e.message });
      // Network error: stay on the cached copy, the queue is kept.
    } finally {
      setQueue([...courierStore.queue()]);
      setSyncing(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void refresh();
    const t = setInterval(() => navigator.onLine && void refresh(), 60_000);
    return () => clearInterval(t);
  }, [storeId, refresh]);

  useEffect(() => {
    if (online && storeId) void refresh();
  }, [online, storeId, refresh]);

  const view = useMemo(() => (server ? withPending(server, queue.filter((a) => a.storeId === storeId)) : null), [server, queue, storeId]);
  const pending = queue.filter((a) => a.storeId === storeId && !a.error);
  const rejected = queue.filter((a) => a.storeId === storeId && a.error);

  function act(order: CourierDelivery, status: QueuedAction['status'], extra: { reason?: string; postponedTo?: string } = {}) {
    if (!storeId) return;
    courierStore.push({ storeId, orderId: order.id, orderNumber: order.number, status, ...extra });
    setQueue([...courierStore.queue()]);
    setSheet(null);
    setMessage({ tone: 'info', text: `Colis n°${order.number} : ${status === 'DELIVERED' ? 'livré' : status === 'REFUSED' ? 'refusé' : 'reporté'}${navigator.onLine ? '' : ' (sera envoyé au retour du réseau)'}` });
    if (navigator.onLine) void refresh();
  }

  if (!view || !storeId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-900 text-white">
        <Spinner className="size-6" />
      </div>
    );
  }

  const currency = view.store?.currency ?? 'XOF';
  const fmt = (n: number) => formatMoney(n, currency);
  const todo = view.orders.filter((o) => o.status === 'SHIPPED');
  const postponed = view.orders.filter((o) => o.status === 'POSTPONED');
  const list = tab === 'todo' ? todo : postponed;
  const toCollect = todo.reduce((s, o) => s + o.total, 0);

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="sticky top-0 z-20 bg-brand-900 px-4 pt-3 pb-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {stores.length > 1 ? (
              <select
                aria-label="Boutique"
                value={storeId}
                onChange={(e) => {
                  session.setStore(e.target.value);
                  setServer(courierStore.cached(e.target.value));
                  setStoreId(e.target.value);
                }}
                className="max-w-full truncate bg-transparent font-bold"
              >
                {stores.map((s) => (
                  <option key={s.storeId} value={s.storeId} className="text-ink">
                    {s.store.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="truncate font-bold">{view.store?.name}</p>
            )}
            <p className="text-sm text-white/75">Bonjour {view.courier?.name}</p>
          </div>
          <button onClick={() => void refresh()} className="tap flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 text-sm font-semibold" aria-label="Synchroniser">
            <span className={cx('size-2.5 rounded-full', online ? 'bg-emerald-400' : 'bg-amber-400')} />
            {syncing ? <Spinner /> : online ? 'En ligne' : 'Hors ligne'}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white/10 p-2">
            <p className="text-2xl font-extrabold">{todo.length}</p>
            <p className="text-[11px] text-white/75">à livrer</p>
          </div>
          <div className="rounded-xl bg-white/10 p-2">
            <p className="text-2xl font-extrabold">{view.courier?.deliveredToday ?? 0}</p>
            <p className="text-[11px] text-white/75">livrés aujourd’hui</p>
          </div>
          <div className="rounded-xl bg-amber-400 p-2 text-amber-950">
            <p className="text-lg leading-8 font-extrabold">{fmt(view.courier?.cashBalance ?? 0)}</p>
            <p className="text-[11px]">cash à verser</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 p-4">
        {!online && (
          <Alert tone="info">
            Pas de réseau : continuez normalement. {pending.length > 0 ? `${pending.length} action(s) en attente d’envoi.` : 'Vos actions seront envoyées au retour du réseau.'}
          </Alert>
        )}
        {online && pending.length > 0 && <Alert tone="info">{pending.length} action(s) en cours d’envoi…</Alert>}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {rejected.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <span>
              Colis n°{a.orderNumber} : {a.error}
            </span>
            <button
              className="font-semibold underline"
              onClick={() => {
                courierStore.setQueue(courierStore.queue().filter((q) => q.id !== a.id));
                setQueue([...courierStore.queue()]);
              }}
            >
              OK
            </button>
          </div>
        ))}

        <div role="tablist" className="grid grid-cols-2 rounded-xl border border-line bg-white p-1">
          {(['todo', 'postponed'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('tap rounded-lg text-sm font-semibold', tab === t ? 'bg-brand-700 text-white' : 'text-muted')}>
              {t === 'todo' ? `À livrer (${todo.length})` : `Reportés (${postponed.length})`}
            </button>
          ))}
        </div>
        {tab === 'todo' && todo.length > 0 && (
          <p className="text-center text-sm text-muted">
            Total à encaisser : <strong className="text-ink">{fmt(toCollect)}</strong>
          </p>
        )}

        {list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
            <p className="text-3xl">{tab === 'todo' ? '🎉' : '📅'}</p>
            <p className="mt-2 font-semibold">{tab === 'todo' ? 'Aucun colis à livrer' : 'Aucun colis reporté'}</p>
            {lastSync && <p className="mt-1 text-sm text-muted">Mis à jour à {new Date(lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>}
          </div>
        )}

        {list.map((o, i) => {
          const showCity = i === 0 || list[i - 1]!.city !== o.city;
          return (
            <div key={o.id}>
              {showCity && <p className="mt-2 mb-1 px-1 text-xs font-bold tracking-wide text-muted uppercase">📍 {o.city}</p>}
              <article className="space-y-3 rounded-2xl border border-line bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      n°{o.number} · {o.customerName}
                    </p>
                    <p className="text-sm text-ink/80">{o.address}</p>
                    {o.postponedTo && o.status === 'POSTPONED' && (
                      <p className="mt-0.5 text-sm font-semibold text-amber-700">Reporté au {new Date(o.postponedTo).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-lg font-extrabold">{fmt(o.total)}</p>
                </div>
                <p className="rounded-lg bg-canvas px-3 py-2 text-sm">{o.items.map((it) => `${it.quantity} × ${it.title}${it.variantTitle ? ` (${it.variantTitle})` : ''}`).join(', ')}</p>
                {o.note && <p className="text-sm text-muted">📝 {o.note}</p>}
                <div className="grid grid-cols-3 gap-2">
                  <a href={`tel:${o.customerPhone}`} className="tap flex items-center justify-center gap-1 rounded-xl bg-brand-50 text-sm font-semibold text-brand-900">
                    📞 Appeler
                  </a>
                  <a href={`https://wa.me/${o.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="tap flex items-center justify-center gap-1 rounded-xl bg-[#1fa855] text-sm font-semibold text-white">
                    <WhatsAppIcon className="size-4" /> WhatsApp
                  </a>
                  <a
                    href={o.gps ? `https://www.google.com/maps/dir/?api=1&destination=${o.gps.lat},${o.gps.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, ${o.city}`)}`}
                    target="_blank"
                    rel="noopener"
                    className="tap flex items-center justify-center gap-1 rounded-xl bg-sky-50 text-sm font-semibold text-sky-900"
                  >
                    🧭 Itinéraire
                  </a>
                </div>
                <div className={cx('grid gap-2', o.status === 'SHIPPED' ? 'grid-cols-[2fr_1fr_1fr]' : 'grid-cols-[2fr_1fr]')}>
                  <Button onClick={() => act(o, 'DELIVERED')}>✓ Livrée</Button>
                  {o.status === 'SHIPPED' && (
                    <Button variant="secondary" onClick={() => setSheet({ order: o, kind: 'POSTPONED' })}>
                      Reporter
                    </Button>
                  )}
                  <Button variant="secondary" className="!text-red-700" onClick={() => setSheet({ order: o, kind: 'REFUSED' })}>
                    Refusée
                  </Button>
                </div>
              </article>
            </div>
          );
        })}

        <div className="pt-6 text-center text-sm text-muted">
          <button
            className="underline"
            onClick={() => {
              if (pending.length && !confirm(`${pending.length} action(s) pas encore envoyée(s) seront perdues. Se déconnecter ?`)) return;
              session.clear();
              window.location.href = '/livreur/connexion';
            }}
          >
            Se déconnecter
          </button>
        </div>
      </main>

      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setSheet(null)}>
          <div role="dialog" aria-modal="true" className="animate-pop w-full rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">
              Colis n°{sheet.order.number} · {sheet.kind === 'REFUSED' ? 'motif du refus' : 'reporter à'}
            </p>
            <div className="mt-4 grid gap-2">
              {sheet.kind === 'REFUSED'
                ? REASONS.map((r) => (
                    <Button key={r} variant="secondary" onClick={() => act(sheet.order, 'REFUSED', { reason: r })}>
                      {r}
                    </Button>
                  ))
                : [
                    { label: 'Demain', d: inDays(1) },
                    { label: 'Après-demain', d: inDays(2) },
                    { label: 'Dans une semaine', d: inDays(7) },
                  ].map(({ label, d }) => (
                    <Button key={label} variant="secondary" onClick={() => act(sheet.order, 'POSTPONED', { postponedTo: d.toISOString() })}>
                      {label} · {d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </Button>
                  ))}
              <Button variant="ghost" onClick={() => setSheet(null)}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
