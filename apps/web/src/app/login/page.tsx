'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { COUNTRIES, type AuthResponse } from '@myabeshop/shared/client';
import { api, ApiError, session } from '@/lib/api';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

function LoginInner() {
  const params = useSearchParams();
  const signup = params.get('signup') === '1';
  // Referral link (§9.3): remembered until the store is created in onboarding.
  useEffect(() => {
    const ref = params.get('ref');
    if (ref) {
      try {
        localStorage.setItem('myabe.ref', ref.toUpperCase());
      } catch {
        /* ignore */
      }
    }
  }, [params]);
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'target' | 'code'>('target');
  const [country, setCountry] = useState('CI');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSignup, setEmailSignup] = useState(signup);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function done(auth: AuthResponse) {
    session.save(auth);
    const next = params.get('next');
    window.location.href = auth.user.memberships.length === 0 ? '/onboarding' : next && next.startsWith('/') ? next : '/dashboard';
  }

  async function run(fn: () => Promise<void>) {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Problème de connexion, réessayez.');
    } finally {
      setLoading(false);
    }
  }

  const dial = COUNTRIES.find((c) => c.code === country)?.dialCode;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <a href="/" className="mb-8 flex items-center gap-2 text-lg font-extrabold text-brand-900">
        <img src="/icon.svg" alt="" width={32} height={32} /> Myabéshop
      </a>
      <h1 className="text-2xl font-bold">{signup ? 'Créez votre boutique' : 'Connexion'}</h1>
      <p className="mt-1 text-muted">{signup ? 'Commencez avec votre numéro de téléphone : vous recevrez un code.' : 'Marchands, équipes et livreurs.'}</p>
      {!signup && (
        <a href="/livreur/connexion" className="mt-2 inline-block text-sm font-semibold text-brand-700">
          🛵 Vous êtes livreur ? Connexion avec votre code PIN →
        </a>
      )}

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-canvas p-1" role="tablist">
        {(['phone', 'email'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`tap rounded-lg text-sm font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}
          >
            {m === 'phone' ? 'Téléphone' : 'E-mail'}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}

        {mode === 'phone' && step === 'target' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const res = await api.post<{ sent: boolean; devCode?: string }>('/auth/otp/request', { target: phone, country, channel: 'sms' });
                setDevCode(res.devCode ?? null);
                setStep('code');
              });
            }}
          >
            <Field label="Pays" htmlFor="country">
              <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name.fr} (+{c.dialCode})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Numéro de téléphone" htmlFor="phone">
              <div className="flex">
                <span className="tap flex items-center rounded-l-xl border border-r-0 border-line bg-canvas px-3 text-muted">+{dial}</span>
                <Input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" required value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-l-none" />
              </div>
            </Field>
            <Button type="submit" block loading={loading}>
              Recevoir le code par SMS
            </Button>
          </form>
        )}

        {mode === 'phone' && step === 'code' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => done(await api.post<AuthResponse>('/auth/otp/verify', { target: phone, country, code, name: name || undefined })));
            }}
          >
            <p className="text-sm text-muted">
              Code envoyé au +{dial} {phone}.{' '}
              <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setStep('target')}>
                Modifier
              </button>
            </p>
            {devCode && <Alert tone="info">Mode développement : votre code est {devCode}</Alert>}
            <Field label="Code à 6 chiffres" htmlFor="code">
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-2xl tracking-[0.5em]" />
            </Field>
            {signup && (
              <Field label="Votre nom" htmlFor="name">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Button type="submit" block loading={loading} disabled={code.length !== 6}>
              Continuer
            </Button>
          </form>
        )}

        {mode === 'email' && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () =>
                done(
                  emailSignup
                    ? await api.post<AuthResponse>('/auth/register', { name, email, password })
                    : await api.post<AuthResponse>('/auth/login', { email, password }),
                ),
              );
            }}
          >
            {emailSignup && (
              <Field label="Votre nom" htmlFor="ename">
                <Input id="ename" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="E-mail" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Mot de passe" htmlFor="password" hint={emailSignup ? '8 caractères minimum' : undefined}>
              <Input id="password" type="password" autoComplete={emailSignup ? 'new-password' : 'current-password'} required minLength={emailSignup ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" block loading={loading}>
              {emailSignup ? 'Créer mon compte' : 'Se connecter'}
            </Button>
            <button type="button" className="w-full text-sm font-semibold text-brand-700" onClick={() => setEmailSignup((v) => !v)}>
              {emailSignup ? 'J’ai déjà un compte' : 'Créer un compte avec mon e-mail'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
