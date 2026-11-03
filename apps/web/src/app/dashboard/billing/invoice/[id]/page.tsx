'use client';

import { use, useEffect, useState } from 'react';
import { formatMoney, getCountry, type InvoiceDto } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui';

/** Printable invoice: "Télécharger en PDF" uses the browser's print-to-PDF. */
export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { store } = useSession();
  const [inv, setInv] = useState<InvoiceDto | null>(null);
  useEffect(() => {
    if (store) void api.get<InvoiceDto>(`/stores/${store.id}/billing/payments/${id}/invoice`).then(setInv);
  }, [store, id]);
  if (!inv) return null;
  const fmt = (n: number) => formatMoney(n, inv.payment.currency);
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <a href="/dashboard/billing" className="text-sm font-semibold text-brand-700">
          ← Abonnement
        </a>
        <Button onClick={() => window.print()}>Télécharger en PDF</Button>
      </div>
      <article className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xl font-extrabold text-brand-900">
              <img src="/icon.svg" alt="" width={28} height={28} /> Myabéshop
            </p>
            <p className="mt-2 text-sm text-muted">{inv.seller.name}</p>
            <p className="text-sm text-muted">{inv.seller.address}</p>
            <p className="text-sm text-muted">{inv.seller.email}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">Facture</p>
            <p className="font-mono text-sm">{inv.number}</p>
            <p className="mt-1 text-sm text-muted">Émise le {d(inv.issuedAt)}</p>
            <p className="mt-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900">PAYÉE</p>
          </div>
        </header>
        <section className="mt-8 rounded-xl bg-canvas p-4 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Facturé à</p>
          <p className="mt-1 font-semibold">{inv.buyer.storeName}</p>
          <p>{inv.buyer.ownerName}</p>
          <p className="text-muted">{[inv.buyer.phone, inv.buyer.email, getCountry(inv.buyer.country)?.name.fr].filter(Boolean).join(' · ')}</p>
        </section>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 font-medium">Désignation</th>
              <th className="py-2 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-3">
                <p className="font-semibold">Abonnement Myabéshop {inv.payment.planName}</p>
                <p className="text-muted">
                  {inv.payment.months === 12 ? '12 mois (2 mois offerts)' : '1 mois'} · du {d(inv.periodStart)} au {d(inv.periodEnd)}
                </p>
              </td>
              <td className="py-3 text-right">{fmt(inv.payment.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 text-right font-semibold">Total payé</td>
              <td className="pt-4 text-right text-lg font-extrabold">{fmt(inv.payment.amount)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-8 text-xs text-muted">
          Paiement {inv.payment.gateway === 'fedapay' ? 'Mobile Money via FedaPay' : inv.payment.gateway} · référence {inv.payment.reference} · payé le {d(inv.payment.paidAt)}.
        </p>
      </article>
    </div>
  );
}
