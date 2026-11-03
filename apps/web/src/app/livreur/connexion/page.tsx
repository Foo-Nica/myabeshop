'use client';

import { useState } from 'react';
import { COUNTRIES, type AuthResponse } from '@myabeshop/shared/client';
import { api, ApiError, session } from '@/lib/api';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

/** Courier sign-in: phone number + PIN given by the merchant (§8.1), no e-mail, no SMS needed. */
export default function CourierLogin() {
  const [country, setCountry] = useState('CI');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = await api.post<AuthResponse>('/auth/courier/login', { phone, country, pin });
      session.save(auth);
      const courierStore = auth.user.memberships.find((m) => m.role === 'COURIER');
      if (courierStore) session.setStore(courierStore.storeId);
      window.location.href = '/livreur';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Pas de connexion internet');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-brand-900 px-5 py-10 text-white">
      <div className="mx-auto w-full max-w-sm">
        <p className="flex items-center gap-2 text-lg font-extrabold">
          <img src="/icon.svg" alt="" width={32} height={32} /> Myabéshop Livreur
        </p>
        <h1 className="mt-8 text-3xl font-extrabold">Bonjour 👋</h1>
        <p className="mt-1 text-white/80">Connectez-vous avec votre numéro et le code PIN donné par votre marchand.</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl bg-white p-5 text-ink">
          <Field label="Pays" htmlFor="c-country">
            <Select id="c-country" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name.fr} (+{c.dialCode})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Numéro de téléphone" htmlFor="c-phone">
            <Input id="c-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01 01 01 01 01" />
          </Field>
          <Field label="Code PIN" htmlFor="c-pin">
            <Input
              id="c-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button block loading={busy} disabled={pin.length < 4 || phone.replace(/\D/g, '').length < 8}>
            Voir mes colis
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-white/70">
          Pas de code PIN ?{' '}
          <a href="/login?next=/livreur" className="font-semibold text-white underline">
            Recevoir un code par SMS
          </a>
        </p>
      </div>
    </div>
  );
}
