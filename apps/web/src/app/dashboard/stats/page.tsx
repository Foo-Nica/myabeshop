'use client';

import { useCallback, useEffect, useState } from 'react';
import { AD_CHANNELS, formatMoney, type StatsBreakdownRow, type StatsReport } from '@myabeshop/shared/client';
import { API_URL, api, ApiError, session } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Field, Input, MoneyInput, Select, cx } from '@/components/ui';
import { BarChart } from '@/components/dashboard/BarChart';

const RANGES = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '3 mois' },
];
const TABS = [
  { key: 'byProduct', label: 'Produits' },
  { key: 'byCity', label: 'Villes' },
  { key: 'bySource', label: 'Sources' },
  { key: 'byCourier', label: 'Livreurs' },
  { key: 'byAgent', label: 'Agents' },
] as const;
const CHANNEL_LABELS: Record<string, string> = { facebook: 'Facebook', tiktok: 'TikTok', google: 'Google', snapchat: 'Snapchat', influencer: 'Influenceur', other: 'Autre' };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const rate = (n: number | null) => (n == null ? '—' : `${n} %`);

export default function StatsPage() {
  const { store } = useSession();
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(new Date()) });
  const [report, setReport] = useState<StatsReport | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('byProduct');
  const [spend, setSpend] = useState<{ day: string; channel: string; amount: number | null }>({ day: iso(new Date()), channel: 'facebook', amount: null });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (store) setReport(await api.get<StatsReport>(`/stores/${store.id}/stats/report?from=${range.from}&to=${range.to}`));
  }, [store, range]);
  useEffect(() => void load(), [load]);

  if (!store || !report) return null;
  const fmt = (n: number) => formatMoney(n, report.currency);
  const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
  const t = report.totals;
  const tiles = [
    { label: 'Encaissé', value: fmt(t.revenue), hint: `${t.delivered} livraison(s)` },
    { label: 'Bénéfice estimé', value: fmt(t.profit), hint: 'après coûts et pub', tone: t.profit < 0 ? 'text-red-700' : 'text-emerald-700' },
    { label: 'Taux de confirmation', value: rate(t.confirmationRate), hint: `${t.confirmed} / ${t.orders} commandes` },
    { label: 'Taux de livraison', value: rate(t.deliveryRate), hint: `${t.delivered} / ${t.shipped} expédiées` },
    { label: 'Panier moyen', value: t.averageBasket == null ? '—' : fmt(t.averageBasket), hint: 'commandes livrées' },
    { label: 'Commandes reçues', value: String(t.orders), hint: `${t.cancelled} annulée(s), ${t.refused} refusée(s)` },
  ];
  const rows: StatsBreakdownRow[] = report[tab];

  async function exportCsv() {
    const res = await fetch(`${API_URL}/stores/${store!.id}/stats/orders.csv?from=${range.from}&to=${range.to}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `commandes-${range.from}-${range.to}.csv`;
    a.click();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Statistiques</h1>
        <Button variant="secondary" onClick={() => void exportCsv()}>
          Exporter (CSV)
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {RANGES.map((r) => {
          const from = iso(new Date(Date.now() - (r.days - 1) * 86_400_000));
          const active = range.from === from && range.to === iso(new Date());
          return (
            <button key={r.days} onClick={() => setRange({ from, to: iso(new Date()) })} className={cx('tap rounded-xl border px-3 text-sm font-semibold', active ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white')}>
              {r.label}
            </button>
          );
        })}
        <div className="flex items-center gap-1 text-sm">
          <Input type="date" aria-label="Du" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className="w-40" />
          <span className="text-muted">→</span>
          <Input type="date" aria-label="Au" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="w-40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-3.5">
            <p className="text-xs text-muted">{tile.label}</p>
            <p className={cx('mt-1 text-xl font-bold', tile.tone)}>{tile.value}</p>
            <p className="text-xs text-muted">{tile.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold">Commandes reçues par jour</h2>
          <BarChart label="Commandes reçues par jour" data={report.daily.map((d) => ({ day: d.day, value: d.orders }))} format={(n) => String(Math.round(n))} integer />
        </Card>
        <Card>
          <h2 className="mb-4 font-bold">Encaissé par jour</h2>
          <BarChart label="Montant encaissé par jour" data={report.daily.map((d) => ({ day: d.day, value: d.revenue }))} format={short} />
        </Card>
      </div>

      <Card>
        <h2 className="font-bold">Bénéfice estimé</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          {[
            ['Chiffre d’affaires encaissé', t.revenue, ''],
            ['Coût des produits livrés', -t.productCost, 'text-muted'],
            ['Commissions livreurs', -t.courierCommissions, 'text-muted'],
            ['Dépenses publicitaires', -t.adSpend, 'text-muted'],
          ].map(([label, value, cls]) => (
            <div key={label as string} className={cx('flex justify-between', cls as string)}>
              <dt>{label}</dt>
              <dd>{fmt(value as number)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <dt>Bénéfice estimé</dt>
            <dd className={t.profit < 0 ? 'text-red-700' : 'text-emerald-700'}>{fmt(t.profit)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">Frais de livraison facturés aux clients : {fmt(t.deliveryFees)} · remises promo : {fmt(t.discounts)}. Renseignez le coût de chaque produit pour un calcul juste.</p>
      </Card>

      <Card className="!p-0">
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-3">
          {TABS.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} className={cx('tap shrink-0 border-b-2 px-3 text-sm font-semibold', tab === x.key ? 'border-brand-700 text-brand-900' : 'border-transparent text-muted')}>
              {x.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">Pas encore de données sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">{TABS.find((x) => x.key === tab)!.label.replace(/s$/, '')}</th>
                  <th className="px-2 py-2 text-right font-medium">Commandes</th>
                  <th className="px-2 py-2 text-right font-medium">Confirmation</th>
                  <th className="px-2 py-2 text-right font-medium">Livraison</th>
                  <th className="px-4 py-2 text-right font-medium">Encaissé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-medium">{r.label}</td>
                    <td className="px-2 py-2.5 text-right">{r.orders}</td>
                    <td className="px-2 py-2.5 text-right">{rate(r.confirmationRate)}</td>
                    <td className="px-2 py-2.5 text-right">{rate(r.deliveryRate)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmt(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="font-bold">Dépenses publicitaires</h2>
          <p className="text-sm text-muted">Notez ce que vous dépensez en pub pour connaître votre vrai bénéfice.</p>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.post(`/stores/${store.id}/stats/ad-spends`, spend);
              setSpend((s) => ({ ...s, amount: null }));
              await load();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Erreur');
            }
          }}
        >
          <Field label="Date" htmlFor="ad-day">
            <Input id="ad-day" type="date" value={spend.day} onChange={(e) => setSpend({ ...spend, day: e.target.value })} />
          </Field>
          <Field label="Canal" htmlFor="ad-ch">
            <Select id="ad-ch" value={spend.channel} onChange={(e) => setSpend({ ...spend, channel: e.target.value })}>
              {AD_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Montant" htmlFor="ad-amt">
            <MoneyInput id="ad-amt" value={spend.amount} currency={store.currency} onChange={(v) => setSpend({ ...spend, amount: v })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" block disabled={!spend.amount}>
              Ajouter
            </Button>
          </div>
        </form>
        {error && <Alert>{error}</Alert>}
        {report.adSpends.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {report.adSpends.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span>
                  {new Date(`${a.day}T12:00:00Z`).toLocaleDateString('fr-FR')} · {CHANNEL_LABELS[a.channel] ?? a.channel}
                  {a.note ? ` · ${a.note}` : ''}
                </span>
                <span className="flex items-center gap-3">
                  <strong>{fmt(a.amount)}</strong>
                  <button
                    className="text-muted underline"
                    onClick={async () => {
                      await api.delete(`/stores/${store.id}/stats/ad-spends/${a.id}`);
                      await load();
                    }}
                  >
                    Retirer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
