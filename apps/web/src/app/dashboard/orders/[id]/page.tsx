'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { ORDER_TRANSITIONS, formatMoney, type CourierDto, type OrderDetailDto, type OrderStatus, type ZoneDto } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { FLAG_LABEL, SOURCE_LABEL, STATUS_LABEL } from '@/lib/labels';
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { StatusBadge } from '@/components/dashboard/OrderRow';
import { WhatsAppIcon } from '@/components/storefront/StoreHeader';

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Confirmer',
  UNREACHABLE: 'Injoignable',
  CANCELLED: 'Annuler',
  SHIPPED: 'Expédier',
  DELIVERED: 'Livrée',
  REFUSED: 'Refusée',
  POSTPONED: 'Reporter',
  RETURNED: 'Retour reçu',
  NEW: 'Remettre en nouvelle',
};

const ACTION_VARIANT: Partial<Record<OrderStatus, 'primary' | 'secondary' | 'danger'>> = {
  CONFIRMED: 'primary',
  DELIVERED: 'primary',
  SHIPPED: 'primary',
  CANCELLED: 'danger',
  REFUSED: 'danger',
};

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { store, can } = useSession();
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [couriers, setCouriers] = useState<CourierDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'REFUSED' | 'POSTPONED' | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<{ customerName: string; customerPhone: string; address: string; zoneId: string; quantities: Record<string, number> }>();

  const load = useCallback(async () => {
    if (!store) return;
    try {
      setOrder(await api.get<OrderDetailDto>(`/stores/${store.id}/orders/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
    }
  }, [store, id]);

  useEffect(() => {
    void load();
    if (!store) return;
    if (can('couriers.read')) void api.get<CourierDto[]>(`/stores/${store.id}/couriers`).then(setCouriers);
    if (can('zones.read')) void api.get<ZoneDto[]>(`/stores/${store.id}/zones`).then(setZones);
  }, [load, store, can]);

  useEffect(() => {
    const onOrder = (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail?.id === id) void load();
    };
    window.addEventListener('myabe:order', onOrder);
    return () => window.removeEventListener('myabe:order', onOrder);
  }, [id, load]);

  async function act(key: string, fn: () => Promise<OrderDetailDto>) {
    setError(null);
    setBusy(key);
    try {
      setOrder(await fn());
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!store) return null;
  if (!order) {
    return error ? <Alert>{error}</Alert> : <div className="flex justify-center py-10 text-brand-700"><Spinner className="size-6" /></div>;
  }

  const base = `/stores/${store.id}/orders/${order.id}`;
  const fmt = (n: number) => formatMoney(n, order.currency);
  const isAgent = store.role === 'AGENT';
  const isCourier = store.role === 'COURIER';
  const next = ORDER_TRANSITIONS[order.status].filter((s) => {
    if (isAgent) return ['CONFIRMED', 'UNREACHABLE', 'CANCELLED'].includes(s);
    if (isCourier) return ['DELIVERED', 'REFUSED', 'POSTPONED'].includes(s);
    if (s === 'SHIPPED' && !order.courierId) return false;
    return true;
  });
  const canEdit = can('orders.write') && ['NEW', 'UNREACHABLE'].includes(order.status);

  function changeStatus(s: OrderStatus) {
    if (s === 'REFUSED' || s === 'POSTPONED') return setPending(s);
    void act(s, () => api.post(`${base}/status`, { status: s }));
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <a href="/dashboard/orders" className="text-sm text-muted print:hidden">
            ← Commandes
          </a>
          <h1 className="text-xl font-bold">Commande n°{order.number}</h1>
          <p className="text-sm text-muted">
            {new Date(order.createdAt).toLocaleString('fr-FR')} · {SOURCE_LABEL[order.source ?? 'direct'] ?? order.source}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {error && <Alert>{error}</Alert>}
      {order.flags.includes('OVER_PLAN_LIMIT') && (
        <Alert>
          Cette commande est arrivée après la limite mensuelle de votre plan. <a href="/dashboard/billing" className="font-semibold underline">Passez au plan supérieur</a> pour la traiter.
        </Alert>
      )}
      {order.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {order.flags.map((f) => (
            <Badge key={f} className="bg-red-50 text-red-700">
              ⚠ {FLAG_LABEL[f] ?? f}
            </Badge>
          ))}
        </div>
      )}

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{order.customerName}</p>
            <p className="text-muted">{order.customerPhone}</p>
          </div>
          <div className="text-right text-xs text-muted">
            {order.customer.score == null ? 'Nouveau client' : `Fiabilité ${order.customer.score} %`}
            <br />
            {order.customer.deliveredCount} livrée(s) · {order.customer.refusedCount} refusée(s)
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 print:hidden">
          <a href={order.callUrl} onClick={() => void api.post(`${base}/contact`, { channel: 'CALL' }).then(() => load())} className="tap flex items-center justify-center gap-2 rounded-xl bg-brand-700 font-semibold text-white">
            📞 Appeler
          </a>
          <a href={order.whatsappUrl} target="_blank" rel="noopener" onClick={() => void api.post(`${base}/contact`, { channel: 'WHATSAPP' }).then(() => load())} className="tap flex items-center justify-center gap-2 rounded-xl bg-[#1fa855] font-semibold text-white">
            <WhatsAppIcon className="size-5" /> WhatsApp
          </a>
        </div>
        {order.callAttempts > 0 && <p className="text-sm text-muted">{order.callAttempts} tentative(s) d’appel</p>}
        <div className="rounded-xl bg-canvas p-3 text-sm">
          <p className="font-medium">📍 {order.city}</p>
          <p>{order.address}</p>
          {order.gps && (
            <a className="mt-1 inline-block font-semibold text-brand-700 underline" target="_blank" rel="noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${order.gps.lat},${order.gps.lng}`}>
              Itinéraire Google Maps
            </a>
          )}
          {order.note && <p className="mt-2 italic">« {order.note} »</p>}
          {order.refusalReason && <p className="mt-2 text-red-700">Motif du refus : {order.refusalReason}</p>}
          {order.postponedTo && <p className="mt-2">Reportée au {new Date(order.postponedTo).toLocaleDateString('fr-FR')}</p>}
        </div>
      </Card>

      {next.length > 0 && (
        <Card className="space-y-3 print:hidden">
          <p className="font-semibold">Changer le statut</p>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <Button key={s} variant={ACTION_VARIANT[s] ?? 'secondary'} loading={busy === s} onClick={() => changeStatus(s)}>
                {ACTION_LABEL[s] ?? STATUS_LABEL[s].fr}
              </Button>
            ))}
          </div>
          {pending && (
            <form
              className="space-y-3 rounded-xl bg-canvas p-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await act(pending, () =>
                  api.post(`${base}/status`, pending === 'REFUSED' ? { status: pending, reason } : { status: pending, postponedTo: new Date(date).toISOString() }),
                );
                if (ok) setPending(null);
              }}
            >
              {pending === 'REFUSED' ? (
                <Field label="Motif du refus" htmlFor="reason">
                  <Select id="reason" required value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Choisir…</option>
                    {['Client absent', 'Client injoignable', 'A changé d’avis', 'Prix trop élevé', 'Produit non conforme', 'Adresse introuvable', 'Autre'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Nouvelle date de livraison" htmlFor="date">
                  <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              )}
              <div className="flex gap-2">
                <Button type="submit" loading={busy === pending}>
                  Valider
                </Button>
                <Button type="button" variant="ghost" onClick={() => setPending(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {can('orders.assign') && couriers.length > 0 && !['DELIVERED', 'REFUSED', 'RETURNED', 'CANCELLED'].includes(order.status) && (
        <Card className="print:hidden">
          <Field label="Livreur" htmlFor="courier" hint={order.status === 'CONFIRMED' ? 'L’assignation passe la commande en livraison' : undefined}>
            <Select
              id="courier"
              value={order.courierId ?? ''}
              onChange={(e) => void act('assign', () => api.post(`${base}/assign`, { courierId: e.target.value || null }))}
            >
              <option value="">Aucun livreur</option>
              {couriers.filter((c) => c.active || c.id === order.courierId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.activeDeliveries} en cours)
                </option>
              ))}
            </Select>
          </Field>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Articles</p>
          {canEdit && !editing && (
            <Button
              variant="ghost"
              className="print:hidden"
              onClick={() => {
                setEdit({
                  customerName: order.customerName,
                  customerPhone: order.customerPhone,
                  address: order.address,
                  zoneId: order.zoneId ?? '',
                  quantities: Object.fromEntries(order.items.map((i) => [i.id, i.quantity])),
                });
                setEditing(true);
              }}
            >
              Modifier
            </Button>
          )}
        </div>
        {editing && edit ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await act('edit', () =>
                api.patch(base, {
                  customerName: edit.customerName,
                  customerPhone: edit.customerPhone,
                  address: edit.address,
                  zoneId: edit.zoneId || undefined,
                  items: order.items.map((i) => ({ id: i.id, quantity: edit.quantities[i.id] ?? i.quantity })),
                }),
              );
              if (ok) setEditing(false);
            }}
          >
            {order.items.map((i) => (
              <Field key={i.id} label={`${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`} htmlFor={`q-${i.id}`}>
                <Input id={`q-${i.id}`} type="number" min={1} max={50} value={edit.quantities[i.id]} onChange={(e) => setEdit({ ...edit, quantities: { ...edit.quantities, [i.id]: Number(e.target.value) } })} />
              </Field>
            ))}
            <Field label="Nom" htmlFor="e-name">
              <Input id="e-name" value={edit.customerName} onChange={(e) => setEdit({ ...edit, customerName: e.target.value })} />
            </Field>
            <Field label="Téléphone" htmlFor="e-phone">
              <Input id="e-phone" value={edit.customerPhone} onChange={(e) => setEdit({ ...edit, customerPhone: e.target.value })} />
            </Field>
            <Field label="Zone" htmlFor="e-zone">
              <Select id="e-zone" value={edit.zoneId} onChange={(e) => setEdit({ ...edit, zoneId: e.target.value })}>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {fmt(z.fee)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Adresse / repère" htmlFor="e-addr">
              <Input id="e-addr" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" loading={busy === 'edit'}>
                Enregistrer
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : (
          <dl className="space-y-1 text-sm">
            {order.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3">
                <dt>
                  {i.quantity} × {i.title}
                  {i.variantTitle ? ` (${i.variantTitle})` : ''}
                </dt>
                <dd>{fmt(i.total)}</dd>
              </div>
            ))}
            <div className="flex justify-between text-muted">
              <dt>Livraison {order.zoneName ? `(${order.zoneName})` : ''}</dt>
              <dd>{fmt(order.deliveryFee)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Remise {order.promoCode ? `(${order.promoCode})` : ''}</dt>
                <dd>−{fmt(order.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold">
              <dt>Total à encaisser</dt>
              <dd>{fmt(order.total)}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">Historique</p>
        <ol className="space-y-2 text-sm">
          {order.events.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-3">
              <p>
                <strong>
                  {e.type === 'CREATED'
                    ? 'Commande reçue'
                    : e.type === 'STATUS'
                      ? `${STATUS_LABEL[e.fromStatus!]?.fr ?? ''} → ${STATUS_LABEL[e.toStatus!]?.fr ?? ''}`
                      : e.type === 'CALL'
                        ? 'Appel'
                        : e.type === 'WHATSAPP'
                          ? 'Message WhatsApp'
                          : e.type === 'ASSIGN'
                            ? 'Assignation'
                            : e.type === 'EDIT'
                              ? 'Modification'
                              : 'Note'}
                </strong>
                {e.note ? ` · ${e.note}` : ''}
              </p>
              <p className="text-xs text-muted">
                {new Date(e.createdAt).toLocaleString('fr-FR')}
                {e.userName ? ` · ${e.userName}` : ''}
              </p>
            </li>
          ))}
        </ol>
        <form
          className="flex gap-2 print:hidden"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act('note', () => api.post(`${base}/notes`, { note }))) setNote('');
          }}
        >
          <Input aria-label="Ajouter une note" placeholder="Ajouter une note…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!note.trim()} loading={busy === 'note'}>
            Ajouter
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          🖨 Imprimer le bon de livraison
        </Button>
        {can('orders.write') && (
          <Button variant="ghost" onClick={() => void act('bl', () => api.post(`${base}/blacklist`, { blacklisted: !order.customer.blacklisted }))}>
            {order.customer.blacklisted ? 'Retirer de la liste noire' : 'Mettre le client en liste noire'}
          </Button>
        )}
        <a href={order.trackingUrl} target="_blank" rel="noopener" className="tap inline-flex items-center px-3 text-sm font-semibold text-brand-700">
          Lien de suivi client ↗
        </a>
      </div>
    </div>
  );
}
