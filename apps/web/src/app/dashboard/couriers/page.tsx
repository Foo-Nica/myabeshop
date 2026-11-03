'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type CourierDto } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, Field, Input, MoneyInput, Select } from '@/components/ui';

type Report = { handed: number; delivered: number; refused: number; postponed: number; cashExpected: number; cashRemitted: number; gap: number; commissionDue: number };

/** Couriers and end-of-day cash reconciliation (§6.5). */
export default function CouriersPage() {
  const { store, can } = useSession();
  const [couriers, setCouriers] = useState<CourierDto[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [commission, setCommission] = useState<number | null>(500);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState('cash');
  const [pinShown, setPinShown] = useState<{ courierId: string; pin: string; phone: string } | null>(null);

  const load = () => store && api.get<CourierDto[]>(`/stores/${store.id}/couriers`).then(setCouriers);
  useEffect(() => void load(), [store]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!store) return null;
  const fmt = (n: number) => formatMoney(n, store.currency);

  async function openReport(c: CourierDto) {
    setOpen(c.id);
    setAmount(c.cashBalance || null);
    setReport(await api.get<Report>(`/stores/${store!.id}/couriers/${c.id}/report`));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Livreurs</h1>
      {error && <Alert>{error}</Alert>}
      <ul className="space-y-3">
        {couriers.map((c) => (
          <li key={c.id}>
            <Card className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold ${c.active ? '' : 'text-muted line-through'}`}>{c.name}</p>
                  <p className="text-sm text-muted">
                    {c.phone} · {c.activeDeliveries} colis en cours · commission {fmt(c.commission)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Cash à verser</p>
                  <p className={`text-lg font-bold ${c.cashBalance > 0 ? 'text-amber-700' : ''}`}>{fmt(c.cashBalance)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void openReport(c)}>Rapport du jour</Button>
                <a className="tap inline-flex items-center rounded-xl px-3 text-sm font-semibold text-brand-700" href={`/dashboard/orders?courierId=${c.id}`}>Ses commandes</a>
                {can('couriers.write') && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const res = await api.post<{ pin: string; phone: string }>(`/stores/${store.id}/couriers/${c.id}/pin`, {});
                      setPinShown({ courierId: c.id, ...res });
                      await load();
                    }}
                  >
                    {c.hasPin ? 'Nouveau code PIN' : 'Créer son code PIN'}
                  </Button>
                )}
                {can('couriers.write') && (
                  <Button variant="ghost" onClick={async () => { await api.patch(`/stores/${store.id}/couriers/${c.id}`, { active: !c.active }); await load(); }}>
                    {c.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                )}
              </div>
              {pinShown?.courierId === c.id && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
                  <p>
                    Code PIN de {c.name} : <strong className="font-mono text-2xl tracking-widest">{pinShown.pin}</strong>
                  </p>
                  <p className="mt-1">Il se connecte sur <strong>{typeof window !== 'undefined' ? window.location.origin : ''}/livreur</strong> avec {pinShown.phone} et ce code. Notez-le : il ne sera plus affiché.</p>
                  <a
                    className="mt-2 inline-flex font-semibold text-[#178a45] underline"
                    target="_blank"
                    rel="noopener"
                    href={`https://wa.me/${pinShown.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour ${c.name}, voici ton accès livreur ${store.name} : ${window.location.origin}/livreur — numéro ${pinShown.phone}, code PIN ${pinShown.pin}`)}`}
                  >
                    Envoyer par WhatsApp
                  </a>
                </div>
              )}
              {open === c.id && report && (
                <div className="space-y-3 rounded-xl bg-canvas p-3 text-sm">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <dt className="text-muted">Remis</dt><dd className="font-semibold">{report.handed}</dd>
                    <dt className="text-muted">Livrés</dt><dd className="font-semibold">{report.delivered}</dd>
                    <dt className="text-muted">Refusés</dt><dd className="font-semibold">{report.refused}</dd>
                    <dt className="text-muted">Reportés</dt><dd className="font-semibold">{report.postponed}</dd>
                    <dt className="text-muted">Cash attendu</dt><dd className="font-semibold">{fmt(report.cashExpected)}</dd>
                    <dt className="text-muted">Cash versé</dt><dd className="font-semibold">{fmt(report.cashRemitted)}</dd>
                    <dt className="text-muted">Écart</dt><dd className={`font-semibold ${report.gap > 0 ? 'text-red-700' : ''}`}>{fmt(report.gap)}</dd>
                    <dt className="text-muted">Commission due</dt><dd className="font-semibold">{fmt(report.commissionDue)}</dd>
                  </dl>
                  {can('couriers.write') && (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setError(null);
                        try {
                          await api.post(`/stores/${store.id}/couriers/${c.id}/remittances`, { amount, method });
                          await load();
                          await openReport({ ...c, cashBalance: 0 });
                        } catch (err) {
                          setError(err instanceof ApiError ? err.message : 'Erreur');
                        }
                      }}
                    >
                      <Field label="Versement reçu" htmlFor={`amt-${c.id}`}><MoneyInput id={`amt-${c.id}`} value={amount} currency={store.currency} onChange={setAmount} /></Field>
                      <Select aria-label="Moyen" value={method} onChange={(e) => setMethod(e.target.value)} className="w-auto">
                        <option value="cash">Espèces</option>
                        <option value="mobile_money">Mobile Money</option>
                        <option value="bank">Virement</option>
                      </Select>
                      <Button type="submit" disabled={!amount}>Valider le versement</Button>
                    </form>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {can('couriers.write') && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await api.post(`/stores/${store.id}/couriers`, { name, phone, commission: commission ?? 0 });
                setName('');
                setPhone('');
                await load();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Erreur');
              }
            }}
          >
            <p className="font-semibold sm:col-span-3">Ajouter un livreur</p>
            <Field label="Nom" htmlFor="cn"><Input id="cn" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Téléphone" htmlFor="cp" hint="Il se connecte avec ce numéro"><Input id="cp" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Commission par livraison" htmlFor="cc"><MoneyInput id="cc" value={commission} currency={store.currency} onChange={setCommission} /></Field>
            <div className="sm:col-span-3"><Button type="submit">Ajouter</Button></div>
          </form>
        </Card>
      )}
    </div>
  );
}
