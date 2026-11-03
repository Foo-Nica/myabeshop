'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type DashboardStats, type OrderSummaryDto, type Paginated } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, EmptyState, LinkButton } from '@/components/ui';
import { OrderRow } from '@/components/dashboard/OrderRow';

export default function DashboardHome() {
  const { store, can } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<OrderSummaryDto[]>([]);

  useEffect(() => {
    if (!store) return;
    if (!can('stats.read')) {
      window.location.href = can('deliveries.read.own') ? '/dashboard/deliveries' : '/dashboard/orders';
      return;
    }
    const load = () => {
      void api.get<DashboardStats>(`/stores/${store.id}/stats?days=30`).then(setStats);
      void api.get<Paginated<OrderSummaryDto>>(`/stores/${store.id}/orders?status=NEW&limit=5`).then((r) => setRecent(r.items));
    };
    load();
    window.addEventListener('myabe:order', load);
    return () => window.removeEventListener('myabe:order', load);
  }, [store, can]);

  if (!store) return null;
  const fmt = (n: number) => formatMoney(n, store.currency);
  const tiles = stats
    ? [
        { label: 'Commandes aujourd’hui', value: String(stats.ordersToday) },
        { label: 'Encaissé (30 j)', value: fmt(stats.revenueCollected) },
        { label: 'Cash chez les livreurs', value: fmt(stats.cashPending) },
        { label: 'Taux de confirmation', value: stats.confirmationRate == null ? '—' : `${stats.confirmationRate} %` },
        { label: 'Taux de livraison', value: stats.deliveryRate == null ? '—' : `${stats.deliveryRate} %` },
        { label: 'Commandes (30 j)', value: String(stats.ordersPeriod) },
      ]
    : [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Tableau de bord</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3.5">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-xl font-bold">{t.value}</p>
          </Card>
        ))}
      </div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">À confirmer</h2>
          <a href="/dashboard/orders" className="text-sm font-semibold text-brand-700">
            Toutes les commandes →
          </a>
        </div>
        {recent.length === 0 ? (
          <EmptyState title="Aucune nouvelle commande" action={<LinkButton href="/dashboard/products" variant="secondary">Partager un produit</LinkButton>}>
            Partagez vos liens produits : les commandes apparaissent ici en direct.
          </EmptyState>
        ) : (
          <Card className="p-0 px-3">
            <ul>{recent.map((o) => <OrderRow key={o.id} order={o} />)}</ul>
          </Card>
        )}
      </section>
    </div>
  );
}
