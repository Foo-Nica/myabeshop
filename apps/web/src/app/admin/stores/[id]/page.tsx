'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { formatMoney, getCountry, type AdminStoreDetail, type AuthResponse } from '@myabeshop/shared/client';
import { api, ApiError, session } from '@/lib/api';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { SUB_LABEL } from '@/lib/labels';

export default function AdminStorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [s, setS] = useState<AdminStoreDetail | null>(null);
  const [reason, setReason] = useState('');
  const [grant, setGrant] = useState({ planCode: 'pro', days: 30 });
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => setS(await api.get<AdminStoreDetail>(`/admin/stores/${id}`)), [id]);
  useEffect(() => void load(), [load]);

  if (!s) return null;
  const run = async (fn: () => Promise<AdminStoreDetail>, ok: string) => {
    setMsg(null);
    try {
      setS(await fn());
      setMsg({ tone: 'success', text: ok });
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Erreur' });
    }
  };

  async function impersonate() {
    if (!confirm(`Ouvrir une session support de 30 minutes en tant que ${s!.owner?.name} ? L’action est journalisée.`)) return;
    const res = await api.post<AuthResponse & { storeId: string }>(`/admin/stores/${id}/impersonate`);
    try {
      localStorage.setItem('myabe.admin.backup', JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken }));
    } catch {
      /* ignore */
    }
    session.save(res);
    session.setStore(res.storeId);
    window.location.href = '/dashboard';
  }

  return (
    <div className="space-y-4">
      <a href="/admin/stores" className="text-sm font-semibold text-brand-700">
        ← Boutiques
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{s.name}</h1>
          <p className="text-sm text-muted">
            <a href={s.url} target="_blank" rel="noopener" className="underline">
              {s.url.replace(/^https?:\/\//, '')}
            </a>{' '}
            · {getCountry(s.country)?.name.fr} · inscrite le {new Date(s.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2">
          {s.status === 'SUSPENDED' ? <Badge className="bg-red-100 text-red-800">Suspendue</Badge> : <Badge className="bg-emerald-100 text-emerald-900">{s.status === 'CLOSED' ? 'Fermée' : 'Ouverte'}</Badge>}
          <Badge className="bg-brand-50 text-brand-900 capitalize">{s.planCode}</Badge>
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {s.suspendedReason && <Alert>Motif de suspension : {s.suspendedReason}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-1 text-sm">
          <p className="font-bold">Propriétaire</p>
          <p>{s.owner?.name}</p>
          <p className="text-muted">{s.owner?.phone}</p>
          <p className="text-muted">{s.owner?.email}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void impersonate()}>
            Se connecter en tant que (support)
          </Button>
        </Card>
        <Card className="text-sm">
          <p className="font-bold">Utilisation</p>
          <dl className="mt-2 grid grid-cols-2 gap-y-1">
            <dt className="text-muted">Commandes ce mois</dt>
            <dd className="text-right font-semibold">{s.usage.ordersThisMonth}</dd>
            <dt className="text-muted">Commandes 30 j</dt>
            <dd className="text-right font-semibold">{s.orders30d}</dd>
            <dt className="text-muted">Produits</dt>
            <dd className="text-right font-semibold">{s.usage.products}</dd>
            <dt className="text-muted">Équipe / livreurs</dt>
            <dd className="text-right font-semibold">
              {s.usage.members} / {s.usage.couriers}
            </dd>
          </dl>
        </Card>
        <Card className="space-y-3 text-sm">
          <p className="font-bold">Modération</p>
          {s.status === 'SUSPENDED' ? (
            <Button onClick={() => void run(() => api.post(`/admin/stores/${id}/unsuspend`), 'Boutique réactivée')}>Réactiver la boutique</Button>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api.post(`/admin/stores/${id}/suspend`, { reason }), 'Boutique suspendue : vitrine masquée, écritures bloquées');
              }}
            >
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (contrefaçon, produit interdit…)" aria-label="Motif" />
              <Button variant="danger" disabled={reason.trim().length < 3}>
                Suspendre
              </Button>
            </form>
          )}
        </Card>
      </div>

      <Card className="space-y-3">
        <p className="font-bold">Abonnement</p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => api.post(`/admin/stores/${id}/plan`, grant), `Plan ${grant.planCode} accordé pour ${grant.days} jours`);
          }}
        >
          <Field label="Accorder le plan" htmlFor="g-plan">
            <Select id="g-plan" value={grant.planCode} onChange={(e) => setGrant({ ...grant, planCode: e.target.value })}>
              <option value="free">Gratuit</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </Select>
          </Field>
          <Field label="Durée (jours)" htmlFor="g-days">
            <Input id="g-days" inputMode="numeric" value={grant.days} onChange={(e) => setGrant({ ...grant, days: Number(e.target.value.replace(/\D/g, '')) || 1 })} className="w-28" />
          </Field>
          <Button type="submit" variant="secondary">
            Appliquer
          </Button>
        </form>
        <ul className="divide-y divide-line text-sm">
          {s.subscriptions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="capitalize">
                {x.planCode} · {x.source === 'trial' ? 'essai' : x.source === 'admin' ? 'accordé' : x.source === 'referral' ? 'parrainage' : 'payé'}
              </span>
              <span className="text-muted">
                {new Date(x.startsAt).toLocaleDateString('fr-FR')} → {new Date(x.endsAt).toLocaleDateString('fr-FR')}
              </span>
              <Badge className={SUB_LABEL[x.status]?.className}>{SUB_LABEL[x.status]?.label ?? x.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-2 font-bold">Paiements</p>
          {s.payments.length === 0 && <p className="text-sm text-muted">Aucun paiement.</p>}
          <ul className="divide-y divide-line text-sm">
            {s.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 py-2">
                <span>
                  {new Date(p.createdAt).toLocaleDateString('fr-FR')} · {p.planName} {p.months === 12 ? '(12 mois)' : ''}
                </span>
                <span>
                  {formatMoney(p.amount, p.currency)} · <span className={p.status === 'SUCCEEDED' ? 'text-emerald-700' : p.status === 'FAILED' ? 'text-red-700' : 'text-amber-700'}>{p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <p className="mb-2 font-bold">Journal</p>
          <ul className="max-h-80 divide-y divide-line overflow-auto text-sm">
            {s.audit.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-mono text-xs">{a.action}</span> <span className="text-muted">· {a.actorName ?? 'système'} · {new Date(a.createdAt).toLocaleString('fr-FR')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
