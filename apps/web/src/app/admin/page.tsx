'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type AdminOverview } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { Card } from '@/components/ui';
import { BarChart } from '@/components/dashboard/BarChart';

export default function AdminHome() {
  const [o, setO] = useState<AdminOverview | null>(null);
  const [ran, setRan] = useState<string | null>(null);
  useEffect(() => void api.get<AdminOverview>('/admin/overview').then(setO), []);
  if (!o) return null;
  const fmt = (n: number) => formatMoney(n, o.revenue.currency);
  const tiles = [
    { label: 'MRR (revenu mensuel récurrent)', value: fmt(o.revenue.mrr), hint: `${fmt(o.revenue.collected30d)} encaissés sur 30 j` },
    { label: 'Boutiques', value: String(o.stores.total), hint: `${o.stores.new30d} nouvelles · ${o.stores.active30d} actives (30 j)` },
    { label: 'Abonnés payants', value: String(o.subscriptions.paying), hint: `${o.subscriptions.trialing} en essai · ${o.subscriptions.pastDue} en grâce` },
    { label: 'Désabonnements (30 j)', value: String(o.subscriptions.churned30d), hint: `${o.stores.suspended} boutique(s) suspendue(s)` },
    { label: 'Commandes aujourd’hui', value: String(o.orders.today), hint: `${o.orders.last30d} sur 30 j` },
    { label: 'Livrées (30 j)', value: String(o.orders.delivered30d), hint: o.orders.last30d ? `${Math.round((o.orders.delivered30d / o.orders.last30d) * 100)} % des commandes` : '—' },
  ];
  const totalStores = Math.max(1, o.plans.reduce((s, p) => s + p.stores, 0));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Vue d’ensemble de la plateforme</h1>
        <button
          className="text-sm font-semibold text-brand-700 underline"
          onClick={async () => setRan(JSON.stringify(await api.post('/admin/billing/run-lifecycle')))}
        >
          Lancer le cycle des abonnements
        </button>
      </div>
      {ran && <p className="font-mono text-xs text-muted">{ran}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3.5">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-bold">{t.value}</p>
            <p className="text-xs text-muted">{t.hint}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <h2 className="mb-4 font-bold">Inscriptions par jour (30 j)</h2>
          <BarChart label="Inscriptions par jour" data={o.signups.map((s) => ({ day: s.day, value: s.count }))} format={(n) => String(Math.round(n))} integer height={140} />
        </Card>
        <Card>
          <h2 className="mb-3 font-bold">Boutiques par plan</h2>
          <ul className="space-y-3 text-sm">
            {o.plans.map((p) => (
              <li key={p.code}>
                <div className="flex justify-between">
                  <span>{p.name}</span>
                  <strong>{p.stores}</strong>
                </div>
                <div className="mt-1 h-2 rounded-full bg-canvas">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${(p.stores / totalStores) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
