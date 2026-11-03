'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
import { WhatsAppIcon } from '@/components/storefront/StoreHeader';

type Delivery = {
  id: string; number: number; status: string; customerName: string; customerPhone: string; city: string; address: string;
  gps: { lat: number; lng: number } | null; total: number; currency: string; items: { title: string; variantTitle: string | null; quantity: number }[];
};

/** Courier view: today's parcels sorted by area, one-tap status (PWA livreur; offline queue comes in phase 2). */
export default function DeliveriesPage() {
  const { store } = useSession();
  const [data, setData] = useState<{ courier: { name: string; cashBalance: number } | null; orders: Delivery[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (store) setData(await api.get(`/stores/${store.id}/deliveries/mine`));
  }, [store]);
  useEffect(() => void load(), [load]);

  if (!store || !data) return null;
  if (!data.courier) return <EmptyState title="Vous n’êtes pas enregistré comme livreur dans cette boutique." />;

  async function setStatus(o: Delivery, status: 'DELIVERED' | 'REFUSED' | 'POSTPONED') {
    setError(null);
    const body: Record<string, string> = { status };
    if (status === 'REFUSED') {
      const reason = prompt('Motif du refus ?', 'Client absent');
      if (!reason) return;
      body.reason = reason;
    }
    if (status === 'POSTPONED') {
      const d = new Date(Date.now() + 86_400_000);
      body.postponedTo = d.toISOString();
    }
    try {
      await api.post(`/stores/${store!.id}/orders/${o.id}/status`, body);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Bonjour {data.courier.name}</p>
          <p className="font-semibold">{data.orders.length} colis à livrer</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Cash à verser</p>
          <p className="text-lg font-bold text-amber-700">{formatMoney(data.courier.cashBalance, store.currency)}</p>
        </div>
      </Card>
      {error && <Alert>{error}</Alert>}
      {data.orders.length === 0 && <EmptyState title="Aucun colis pour le moment" />}
      {data.orders.map((o) => (
        <Card key={o.id} className="space-y-3">
          <div className="flex justify-between gap-2">
            <p className="font-semibold">#{o.number} · {o.customerName}</p>
            <p className="font-bold">{formatMoney(o.total, o.currency)}</p>
          </div>
          <p className="text-sm">📍 {o.city} · {o.address}</p>
          <p className="text-sm text-muted">{o.items.map((i) => `${i.quantity} × ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`).join(', ')}</p>
          <div className="grid grid-cols-3 gap-2">
            <a href={`tel:${o.customerPhone}`} className="tap flex items-center justify-center rounded-xl bg-brand-50 font-semibold text-brand-900">📞</a>
            <a href={`https://wa.me/${o.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="tap flex items-center justify-center rounded-xl bg-[#1fa855] text-white"><WhatsAppIcon className="size-5" /></a>
            <a
              href={o.gps ? `https://www.google.com/maps/dir/?api=1&destination=${o.gps.lat},${o.gps.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, ${o.city}`)}`}
              target="_blank" rel="noopener" className="tap flex items-center justify-center rounded-xl bg-sky-50 font-semibold text-sky-900"
            >
              🧭
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => void setStatus(o, 'DELIVERED')}>Livrée</Button>
            <Button variant="secondary" onClick={() => void setStatus(o, 'POSTPONED')}>Demain</Button>
            <Button variant="danger" onClick={() => void setStatus(o, 'REFUSED')}>Refusée</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
