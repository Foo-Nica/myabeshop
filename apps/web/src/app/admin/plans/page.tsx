'use client';

import { useEffect, useState } from 'react';
import { PLAN_FEATURE_LABELS, formatMoney, type PlanDto, type PlanFeature } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Card, Field, Input, MoneyInput } from '@/components/ui';

type Row = PlanDto & { stores: number };
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\D/g, '')));

export default function AdminPlans() {
  const [plans, setPlans] = useState<Row[]>([]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  useEffect(() => void api.get<Row[]>('/admin/plans').then(setPlans), []);
  const set = (id: string, patch: Partial<Row>) => setPlans((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Plans et prix</h1>
      <p className="text-sm text-muted">Les changements s’appliquent immédiatement à toutes les boutiques du plan (limites) et aux prochains paiements (prix).</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{p.name}</p>
              <span className="text-sm text-muted">{p.stores} boutique(s)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prix mensuel" htmlFor={`price-${p.id}`}>
                <MoneyInput id={`price-${p.id}`} value={p.price} onChange={(v) => set(p.id, { price: v ?? 0 })} />
              </Field>
              <Field label="Commandes / mois" htmlFor={`o-${p.id}`} hint="vide = illimité">
                <Input id={`o-${p.id}`} value={p.limits.ordersPerMonth ?? ''} onChange={(e) => set(p.id, { limits: { ...p.limits, ordersPerMonth: num(e.target.value) } })} />
              </Field>
              <Field label="Produits" htmlFor={`p-${p.id}`} hint="vide = illimité">
                <Input id={`p-${p.id}`} value={p.limits.products ?? ''} onChange={(e) => set(p.id, { limits: { ...p.limits, products: num(e.target.value) } })} />
              </Field>
              <Field label="Membres d’équipe" htmlFor={`m-${p.id}`} hint="vide = illimité">
                <Input id={`m-${p.id}`} value={p.limits.members ?? ''} onChange={(e) => set(p.id, { limits: { ...p.limits, members: num(e.target.value) } })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {(Object.keys(PLAN_FEATURE_LABELS) as PlanFeature[]).map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-brand-700" checked={!!p.limits[f]} onChange={(e) => set(p.id, { limits: { ...p.limits, [f]: e.target.checked } })} />
                  {PLAN_FEATURE_LABELS[f]}
                </label>
              ))}
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-brand-700" checked={p.limits.showPlatformBadge} onChange={(e) => set(p.id, { limits: { ...p.limits, showPlatformBadge: e.target.checked } })} />
                Mention Myabéshop
              </label>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                setMsg(null);
                try {
                  const { ordersPerMonth, products, members, customDomain, couriers, pixels, promoCodes, agents, sheets, showPlatformBadge } = p.limits;
                  await api.patch(`/admin/plans/${p.id}`, { price: p.price, limits: { ordersPerMonth, products, members, customDomain, couriers, pixels, promoCodes, agents, sheets, showPlatformBadge } });
                  setMsg({ tone: 'success', text: `${p.name} enregistré (${formatMoney(p.price, p.currency)} / mois)` });
                } catch (e) {
                  setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : 'Erreur' });
                }
              }}
            >
              Enregistrer {p.name}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
