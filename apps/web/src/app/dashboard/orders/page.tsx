'use client';

import { useCallback, useEffect, useState } from 'react';
import { ORDER_SOURCES, type CourierDto, type OrderCounts, type OrderStatus, type OrderSummaryDto, type Paginated, type ZoneDto } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { SOURCE_LABEL, STATUS_LABEL } from '@/lib/labels';
import { Alert, Button, Card, EmptyState, Input, LinkButton, Select, Spinner, cx } from '@/components/ui';
import { OrderRow } from '@/components/dashboard/OrderRow';

const TABS: (OrderStatus | 'ALL')[] = ['NEW', 'UNREACHABLE', 'CONFIRMED', 'SHIPPED', 'POSTPONED', 'DELIVERED', 'REFUSED', 'CANCELLED', 'ALL'];

export default function OrdersPage() {
  const { store, can } = useSession();
  const [tab, setTab] = useState<OrderStatus | 'ALL'>('NEW');
  const [q, setQ] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [courierId, setCourierId] = useState('');
  const [source, setSource] = useState('');
  const [orders, setOrders] = useState<OrderSummaryDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [counts, setCounts] = useState<OrderCounts | null>(null);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [couriers, setCouriers] = useState<CourierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCourier, setBulkCourier] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const query = useCallback(
    (after?: string) => {
      const p = new URLSearchParams({ limit: '30' });
      if (tab !== 'ALL') p.set('status', tab);
      if (q) p.set('q', q);
      if (zoneId) p.set('zoneId', zoneId);
      if (courierId) p.set('courierId', courierId);
      if (source) p.set('source', source);
      if (after) p.set('cursor', after);
      return p.toString();
    },
    [tab, q, zoneId, courierId, source],
  );

  const load = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const [list, c] = await Promise.all([
      api.get<Paginated<OrderSummaryDto>>(`/stores/${store.id}/orders?${query()}`),
      api.get<OrderCounts>(`/stores/${store.id}/orders/counts`),
    ]);
    setOrders(list.items);
    setCursor(list.nextCursor);
    setCounts(c);
    setSelected(new Set());
    setLoading(false);
  }, [store, query]);

  useEffect(() => {
    const id = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  useEffect(() => {
    if (!store) return;
    if (can('zones.read')) void api.get<ZoneDto[]>(`/stores/${store.id}/zones`).then(setZones);
    if (can('couriers.read')) void api.get<CourierDto[]>(`/stores/${store.id}/couriers`).then(setCouriers);
  }, [store, can]);

  useEffect(() => {
    const onOrder = () => void load();
    window.addEventListener('myabe:order', onOrder);
    return () => window.removeEventListener('myabe:order', onOrder);
  }, [load]);

  async function bulk(action: 'confirm' | 'assign') {
    if (!store) return;
    try {
      const res = await api.post<{ results: { ok: boolean }[] }>(`/stores/${store.id}/orders/bulk`, {
        orderIds: [...selected],
        action,
        courierId: action === 'assign' ? bulkCourier : undefined,
      });
      const ok = res.results.filter((r) => r.ok).length;
      setMessage(`${ok} commande(s) traitée(s)${ok < res.results.length ? `, ${res.results.length - ok} ignorée(s)` : ''}.`);
      await load();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Erreur');
    }
  }

  function exportCsv() {
    const rows = [['Numéro', 'Date', 'Statut', 'Client', 'Téléphone', 'Ville', 'Articles', 'Total', 'Source', 'Livreur']];
    for (const o of orders) rows.push([String(o.number), new Date(o.createdAt).toLocaleString('fr-FR'), STATUS_LABEL[o.status].fr, o.customerName, o.customerPhone, o.city, o.itemsSummary, String(o.total), o.source ?? '', o.courierName ?? '']);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `commandes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (!store) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Commandes</h1>
        <div className="flex gap-2">
          {can('orders.read.all') && (
            <Button variant="secondary" onClick={exportCsv}>
              Exporter
            </Button>
          )}
          {can('orders.write') && <LinkButton href="/dashboard/orders/new">＋ Commande téléphone</LinkButton>}
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {TABS.map((s) => {
          const n = s === 'ALL' ? null : counts?.byStatus[s];
          return (
            <button key={s} onClick={() => setTab(s)} className={cx('tap shrink-0 rounded-full border px-4 text-sm font-semibold', tab === s ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white')}>
              {s === 'ALL' ? 'Toutes' : STATUS_LABEL[s].fr}
              {n ? <span className="ml-1.5 opacity-80">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Input placeholder="Nom, téléphone, n°…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        {zones.length > 0 && (
          <Select aria-label="Zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            <option value="">Toutes les zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
        )}
        {couriers.length > 0 && (
          <Select aria-label="Livreur" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
            <option value="">Tous les livreurs</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Toutes les sources</option>
          {ORDER_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {message && <Alert tone="info">{message}</Alert>}

      {selected.size > 0 && can('orders.assign') && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-semibold">{selected.size} sélectionnée(s)</span>
          <Button onClick={() => void bulk('confirm')}>Confirmer</Button>
          {couriers.length > 0 && (
            <>
              <Select aria-label="Livreur" value={bulkCourier} onChange={(e) => setBulkCourier(e.target.value)} className="w-auto">
                <option value="">Choisir un livreur</option>
                {couriers.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={!bulkCourier} onClick={() => void bulk('assign')}>
                Assigner
              </Button>
            </>
          )}
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner className="size-6" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState title="Aucune commande ici">Les nouvelles commandes apparaissent en direct, avec un son.</EmptyState>
      ) : (
        <Card className="!p-0 pr-1">
          <ul>
            {orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                selected={selected.has(o.id)}
                onSelect={
                  can('orders.assign')
                    ? (v) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(o.id);
                          else n.delete(o.id);
                          return n;
                        })
                    : undefined
                }
              />
            ))}
          </ul>
        </Card>
      )}
      {cursor && (
        <Button
          variant="secondary"
          block
          onClick={async () => {
            const more = await api.get<Paginated<OrderSummaryDto>>(`/stores/${store.id}/orders?${query(cursor)}`);
            setOrders((o) => [...o, ...more.items]);
            setCursor(more.nextCursor);
          }}
        >
          Voir plus
        </Button>
      )}
    </div>
  );
}
