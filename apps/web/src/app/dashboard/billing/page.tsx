'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ANNUAL_PAID_MONTHS,
  formatMoney,
  planCharge,
  type BillingOverview,
  type BillingPeriod,
  type CheckoutResponse,
  type PaymentDto,
  type PlanDto,
} from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Badge, Button, Card, Field, Input, cx } from '@/components/ui';

const STATUS: Record<string, { label: string; className: string }> = {
  TRIALING: { label: 'Essai gratuit', className: 'bg-sky-100 text-sky-900' },
  ACTIVE: { label: 'Actif', className: 'bg-emerald-100 text-emerald-900' },
  PAST_DUE: { label: 'Expiré — période de grâce', className: 'bg-red-100 text-red-900' },
};
const PAY_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'bg-amber-100 text-amber-900' },
  SUCCEEDED: { label: 'Payé', className: 'bg-emerald-100 text-emerald-900' },
  FAILED: { label: 'Échoué', className: 'bg-red-100 text-red-900' },
  REFUNDED: { label: 'Remboursé', className: 'bg-gray-100 text-gray-800' },
};

function features(p: PlanDto): string[] {
  const l = p.limits;
  const n = (v: number | null, unit: string) => (v == null ? `${unit} illimités` : `${new Intl.NumberFormat('fr-FR').format(v)} ${unit}`);
  return [
    `${n(l.ordersPerMonth, 'commandes')} / mois`,
    n(l.products, 'produits'),
    l.members == null ? 'Équipe illimitée' : `${l.members} membre${l.members > 1 ? 's' : ''} d’équipe`,
    ...(l.couriers ? ['Livreurs et suivi du cash'] : []),
    ...(l.pixels ? ['Pixels Facebook et TikTok'] : []),
    ...(l.promoCodes ? ['Codes promo'] : []),
    ...(l.agents ? ['Agents de confirmation'] : []),
    ...(l.sheets ? ['Google Sheets'] : []),
    ...(l.customDomain ? ['Domaine personnalisé'] : []),
    ...(p.code === 'business' ? ['Plusieurs boutiques, API, support prioritaire'] : []),
    ...(l.showPlatformBadge ? ['Mention « Créé avec Myabéshop »'] : ['Sans mention Myabéshop']),
  ];
}

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max == null ? 8 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-semibold">
          {used}
          {max == null ? '' : ` / ${max}`}
          {max == null && <span className="font-normal text-muted"> · illimité</span>}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-canvas">
        <div className={cx('h-2 rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { store } = useSession();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('MONTHLY');
  const [chosen, setChosen] = useState<PlanDto | null>(null);
  const [phone, setPhone] = useState('');
  const [operator, setOperator] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (store) setData(await api.get<BillingOverview>(`/stores/${store.id}/billing`));
  }, [store]);
  useEffect(() => void load(), [load]);

  // Back from the payment page: poll the gateway until the payment settles.
  useEffect(() => {
    if (!store) return;
    const id = new URLSearchParams(window.location.search).get('payment');
    if (!id) return;
    let tries = 0;
    setNotice({ tone: 'info', text: 'Vérification du paiement…' });
    const tick = async () => {
      tries++;
      const p = await api.post<PaymentDto>(`/stores/${store.id}/billing/payments/${id}/refresh`).catch(() => null);
      if (p?.status === 'SUCCEEDED') {
        setNotice({ tone: 'success', text: `Paiement reçu : votre boutique est sur le plan ${p.planName}. Merci !` });
        await load();
        return;
      }
      if (p?.status === 'FAILED') {
        setNotice({ tone: 'error', text: 'Le paiement n’a pas abouti. Vous pouvez réessayer.' });
        await load();
        return;
      }
      if (tries < 20) setTimeout(() => void tick(), 3000);
      else setNotice({ tone: 'info', text: 'Paiement toujours en attente : validez-le sur votre téléphone, la page se mettra à jour.' });
    };
    void tick();
  }, [store, load]);

  if (!store || !data) return null;
  const fmt = (n: number) => formatMoney(n, data.plan.currency);
  const sub = data.subscription;
  const paid = data.plans.filter((p) => p.price > 0);

  async function pay() {
    if (!chosen || !store) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<CheckoutResponse>(`/stores/${store.id}/billing/checkout`, { planCode: chosen.code, period, phone, operator: operator || undefined });
      window.location.href = res.checkoutUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Abonnement</h1>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Plan actuel</p>
            <p className="text-2xl font-extrabold">{data.plan.name}</p>
            {sub ? (
              <p className="mt-1 text-sm text-muted">
                {sub.status === 'PAST_DUE'
                  ? `Expiré le ${new Date(sub.endsAt).toLocaleDateString('fr-FR')} · actif jusqu’au ${new Date(sub.graceEndsAt!).toLocaleDateString('fr-FR')}`
                  : `${sub.status === 'TRIALING' ? 'Essai jusqu’au' : 'Payé jusqu’au'} ${new Date(sub.endsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${data.daysLeft != null && data.daysLeft >= 0 ? ` · ${data.daysLeft} jour(s) restant(s)` : ''}`}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Plan gratuit, sans engagement.</p>
            )}
          </div>
          {sub && <Badge className={STATUS[sub.status]?.className}>{STATUS[sub.status]?.label ?? sub.status}</Badge>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Usage label="Commandes ce mois" used={data.usage.ordersThisMonth} max={data.plan.limits.ordersPerMonth} />
          <Usage label="Produits" used={data.usage.products} max={data.plan.limits.products} />
          <Usage label="Membres d’équipe" used={data.usage.members} max={data.plan.limits.members} />
        </div>
        {data.lockedOrders > 0 && <Alert>{data.lockedOrders} commande(s) reçue(s) au-delà de la limite mensuelle sont en attente. Passez au plan supérieur pour les traiter.</Alert>}
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">Changer de plan</h2>
          <div role="radiogroup" aria-label="Période" className="inline-flex rounded-xl border border-line bg-white p-1">
            {(['MONTHLY', 'ANNUAL'] as const).map((p) => (
              <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)} className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', period === p ? 'bg-brand-700 text-white' : 'text-muted')}>
                {p === 'MONTHLY' ? 'Mensuel' : `Annuel · ${12 - ANNUAL_PAID_MONTHS} mois offerts`}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {paid.map((p) => {
            const charge = planCharge(p.price, period);
            const current = data.plan.code === p.code && sub?.status !== 'TRIALING';
            return (
              <Card key={p.id} className={cx('flex flex-col', p.code === 'pro' && 'border-2 border-brand-500')}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">{p.name}</p>
                  {p.code === 'pro' && <Badge className="bg-brand-100 text-brand-900">Le plus choisi</Badge>}
                </div>
                <p className="mt-2">
                  <span className="text-2xl font-extrabold">{fmt(period === 'ANNUAL' ? Math.round(charge.amount / 12) : charge.amount)}</span>
                  <span className="text-sm text-muted"> / mois</span>
                </p>
                <p className="text-xs text-muted">{period === 'ANNUAL' ? `${fmt(charge.amount)} payés une fois pour 12 mois` : 'Sans engagement'}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                  {features(p).map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-brand-600" aria-hidden>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-4" variant={p.code === 'pro' ? 'primary' : 'secondary'} onClick={() => { setChosen(p); setError(null); }}>
                  {current ? 'Renouveler' : `Choisir ${p.name}`}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      {chosen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => !busy && setChosen(null)}>
          <div role="dialog" aria-modal="true" aria-label="Paiement" className="animate-pop w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Plan {chosen.name} · {period === 'ANNUAL' ? '12 mois' : '1 mois'}</p>
            <p className="text-2xl font-extrabold text-brand-700">{fmt(planCharge(chosen.price, period).amount)}</p>
            <div className="mt-4 space-y-4">
              {data.operators.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium">Moyen de paiement</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {data.operators.map((o) => (
                      <button key={o.code} type="button" aria-pressed={operator === o.code} onClick={() => setOperator(o.code)} className={cx('tap rounded-xl border-2 px-3 text-sm font-semibold', operator === o.code ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-line')}>
                        {o.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              <Field label="Numéro Mobile Money" htmlFor="pay-phone" hint="Vous validerez sur ce téléphone">
                <Input id="pay-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07 00 00 00 00" />
              </Field>
              {error && <Alert>{error}</Alert>}
              <Button block loading={busy} disabled={phone.replace(/\D/g, '').length < 8} onClick={() => void pay()}>
                Payer {fmt(planCharge(chosen.price, period).amount)}
              </Button>
              <p className="text-center text-xs text-muted">
                Paiement sécurisé {data.gateway === 'fedapay' ? 'par FedaPay' : '(simulateur de développement)'} · le plan s’active dès la confirmation.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-bold">Parrainage</h2>
          <p className="mt-1 text-sm text-muted">Invitez un autre vendeur : vous gagnez un mois offert dès qu’il s’abonne.</p>
          <div className="mt-3 flex gap-2">
            <Input readOnly value={data.referral.url} aria-label="Lien de parrainage" className="text-sm" />
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(data.referral.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copié' : 'Copier'}
            </Button>
          </div>
          <p className="mt-2 text-sm">
            Code <strong>{data.referral.code}</strong> · {data.referral.referred} filleul(s) · {data.referral.rewarded} mois gagné(s)
          </p>
        </Card>
        <Card className="!p-0">
          <h2 className="px-4 pt-4 font-bold sm:px-5">Paiements et factures</h2>
          {data.payments.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted sm:px-5">Aucun paiement pour le moment.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div>
                    <p className="font-semibold">
                      {p.planName} · {p.months === 12 ? '12 mois' : '1 mois'}
                    </p>
                    <p className="text-muted">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString('fr-FR')} · {fmt(p.amount)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={PAY_STATUS[p.status]?.className}>{PAY_STATUS[p.status]?.label}</Badge>
                    {p.invoiceNumber && (
                      <a className="font-semibold text-brand-700" href={`/dashboard/billing/invoice/${p.id}`}>
                        Facture
                      </a>
                    )}
                    {p.status === 'PENDING' && p.checkoutUrl && (
                      <a className="font-semibold text-brand-700" href={p.checkoutUrl}>
                        Payer
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
