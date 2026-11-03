'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatMoney } from '@myabeshop/shared/client';
import { API_URL } from '@/lib/api';
import { Alert, Button } from '@/components/ui';

type Info = { reference: string; amount: number; currency: string; planName: string; months: number; storeName: string; payerPhone: string | null; status: string };

/**
 * Development stand-in for the Mobile Money gateway page (FedaPay in production).
 * Lets you approve or decline a payment to test the whole subscription flow locally.
 */
function Simulator() {
  const ref = useSearchParams().get('ref') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/billing/simulator/${encodeURIComponent(ref)}`)
      .then(async (r) => (r.ok ? setInfo(await r.json()) : setError('Paiement introuvable (le simulateur est désactivé en production).')))
      .catch(() => setError('API injoignable'));
  }, [ref]);

  async function settle(outcome: 'SUCCEEDED' | 'FAILED') {
    setBusy(outcome);
    const res = await fetch(`${API_URL}/billing/simulator/${encodeURIComponent(ref)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome }) });
    const data = await res.json();
    setTimeout(() => (window.location.href = data.returnUrl ?? '/dashboard/billing'), 900);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1f3a] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-[#ffcc00] px-5 py-4">
          <p className="text-xs font-bold tracking-widest text-black/60 uppercase">Simulateur Mobile Money</p>
          <p className="text-lg font-extrabold text-black">Paiement sécurisé</p>
        </div>
        <div className="space-y-4 p-5">
          {error && <Alert>{error}</Alert>}
          {info && (
            <>
              <div className="text-center">
                <p className="text-sm text-muted">Montant à payer</p>
                <p className="text-3xl font-extrabold">{formatMoney(info.amount, info.currency)}</p>
                <p className="mt-1 text-sm text-muted">
                  Myabéshop {info.planName} · {info.months === 12 ? '12 mois' : '1 mois'} · {info.storeName}
                </p>
              </div>
              <div className="rounded-xl bg-canvas p-3 text-sm">
                <p>
                  Téléphone : <strong>{info.payerPhone}</strong>
                </p>
                <p>
                  Référence : <span className="font-mono">{info.reference}</span>
                </p>
              </div>
              {info.status !== 'PENDING' ? (
                <Alert tone="info">Ce paiement est déjà traité ({info.status}).</Alert>
              ) : busy ? (
                <Alert tone={busy === 'SUCCEEDED' ? 'success' : 'error'}>{busy === 'SUCCEEDED' ? 'Paiement validé, retour à la boutique…' : 'Paiement refusé, retour…'}</Alert>
              ) : (
                <div className="grid gap-2">
                  <Button block onClick={() => void settle('SUCCEEDED')} className="!bg-[#0b7a3b]">
                    Valider le paiement
                  </Button>
                  <Button block variant="secondary" onClick={() => void settle('FAILED')}>
                    Refuser
                  </Button>
                </div>
              )}
              <p className="text-center text-xs text-muted">En production, cette page est celle de FedaPay (MTN, Moov, Orange, Wave, carte).</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense>
      <Simulator />
    </Suspense>
  );
}
