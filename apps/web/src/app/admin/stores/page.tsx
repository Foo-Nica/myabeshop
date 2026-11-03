'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCountry, type AdminStoreRow, type Paginated } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { SUB_LABEL } from '@/lib/labels';


export default function AdminStores() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [data, setData] = useState<Paginated<AdminStoreRow> | null>(null);

  const load = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(plan ? { plan } : {}), ...(cursor ? { cursor } : {}) });
    const res = await api.get<Paginated<AdminStoreRow>>(`/admin/stores?${params}`);
    setData((d) => (cursor && d ? { items: [...d.items, ...res.items], nextCursor: res.nextCursor } : res));
  }, [q, status, plan]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Boutiques</h1>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, adresse, téléphone ou e-mail du propriétaire" aria-label="Recherche" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          <option value="ACTIVE">Ouvertes</option>
          <option value="CLOSED">Fermées</option>
          <option value="SUSPENDED">Suspendues</option>
        </Select>
        <Select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
          <option value="">Tous les plans</option>
          <option value="free">Gratuit</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
        </Select>
      </div>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Boutique</th>
              <th className="px-2 py-2.5 font-medium">Propriétaire</th>
              <th className="px-2 py-2.5 font-medium">Plan</th>
              <th className="px-2 py-2.5 text-right font-medium">Commandes 30 j</th>
              <th className="px-2 py-2.5 text-right font-medium">Produits</th>
              <th className="px-4 py-2.5 font-medium">Inscrite le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-canvas" onClick={() => (window.location.href = `/admin/stores/${s.id}`)}>
                <td className="px-4 py-3">
                  <a href={`/admin/stores/${s.id}`} className="font-semibold">
                    {s.name}
                  </a>
                  <p className="text-xs text-muted">
                    {s.slug} · {getCountry(s.country)?.name.fr}
                    {s.status !== 'ACTIVE' && <Badge className={s.status === 'SUSPENDED' ? 'ml-2 bg-red-100 text-red-800' : 'ml-2 bg-gray-100 text-gray-700'}>{s.status === 'SUSPENDED' ? 'Suspendue' : 'Fermée'}</Badge>}
                  </p>
                </td>
                <td className="px-2 py-3">
                  <p>{s.owner?.name}</p>
                  <p className="text-xs text-muted">{s.owner?.phone ?? s.owner?.email}</p>
                </td>
                <td className="px-2 py-3">
                  <span className="font-medium capitalize">{s.planCode ?? '—'}</span>
                  {s.subscriptionStatus && <Badge className={`ml-2 ${SUB_LABEL[s.subscriptionStatus]?.className}`}>{SUB_LABEL[s.subscriptionStatus]?.label}</Badge>}
                </td>
                <td className="px-2 py-3 text-right font-semibold">{s.orders30d}</td>
                <td className="px-2 py-3 text-right">{s.products}</td>
                <td className="px-4 py-3 text-muted">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <p className="p-5 text-sm text-muted">Aucune boutique ne correspond.</p>}
      </Card>
      {data?.nextCursor && (
        <Button variant="secondary" onClick={() => void load(data.nextCursor!)}>
          Voir plus
        </Button>
      )}
    </div>
  );
}
