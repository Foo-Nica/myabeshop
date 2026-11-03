'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type PaymentDto } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { Badge, Card } from '@/components/ui';

type Row = PaymentDto & { store: { id: string; name: string; slug: string } };
const TONE: Record<string, string> = { SUCCEEDED: 'bg-emerald-100 text-emerald-900', FAILED: 'bg-red-100 text-red-800', PENDING: 'bg-amber-100 text-amber-900', REFUNDED: 'bg-gray-100 text-gray-700' };
const LABEL: Record<string, string> = { SUCCEEDED: 'Payé', FAILED: 'Échoué', PENDING: 'En attente', REFUNDED: 'Remboursé' };

export default function AdminPayments() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => void api.get<Row[]>('/admin/payments').then(setRows), []);
  const total = rows.filter((r) => r.status === 'SUCCEEDED').reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Paiements</h1>
      <p className="text-sm text-muted">50 derniers paiements · {formatMoney(total, 'XOF')} encaissés sur cette liste</p>
      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-2 py-2.5 font-medium">Boutique</th>
              <th className="px-2 py-2.5 font-medium">Plan</th>
              <th className="px-2 py-2.5 text-right font-medium">Montant</th>
              <th className="px-2 py-2.5 font-medium">Passerelle</th>
              <th className="px-4 py-2.5 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-muted">{new Date(p.createdAt).toLocaleString('fr-FR')}</td>
                <td className="px-2 py-3">
                  <a className="font-semibold" href={`/admin/stores/${p.store.id}`}>
                    {p.store.name}
                  </a>
                </td>
                <td className="px-2 py-3">
                  {p.planName} {p.months === 12 ? '· annuel' : ''}
                </td>
                <td className="px-2 py-3 text-right font-semibold">{formatMoney(p.amount, p.currency)}</td>
                <td className="px-2 py-3 font-mono text-xs">{p.gateway}</td>
                <td className="px-4 py-3">
                  <Badge className={TONE[p.status]}>{LABEL[p.status]}</Badge>
                  {p.invoiceNumber && <span className="ml-2 font-mono text-xs text-muted">{p.invoiceNumber}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-5 text-sm text-muted">Aucun paiement.</p>}
      </Card>
    </div>
  );
}
