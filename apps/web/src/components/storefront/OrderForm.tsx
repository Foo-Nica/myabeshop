'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deliveryFeeFor,
  formatMoney,
  priceForQuantity,
  promoDiscount,
  type PublicOrderCreated,
  type PublicProductDto,
  type PublicStoreDto,
} from '@myabeshop/shared/client';
import { t } from '@/lib/storefront-i18n';
import { fire } from './Pixels';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SOURCES = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'google'];

function detectSource(params: URLSearchParams): { source?: string; utm?: Record<string, string> } {
  const utm: Record<string, string> = {};
  for (const [k, v] of params) if (k.startsWith('utm_') || k === 'fbclid' || k === 'ttclid') utm[k] = v.slice(0, 200);
  const raw = (params.get('utm_source') ?? params.get('src') ?? '').toLowerCase();
  let source = SOURCES.find((s) => raw.includes(s) || (s === 'facebook' && raw === 'fb'));
  if (!source && utm.fbclid) source = 'facebook';
  if (!source && utm.ttclid) source = 'tiktok';
  if (!source && typeof document !== 'undefined' && document.referrer) {
    const ref = document.referrer.toLowerCase();
    source = SOURCES.find((s) => ref.includes(s));
  }
  return { source: source ?? (Object.keys(utm).length ? 'other' : 'direct'), utm: Object.keys(utm).length ? utm : undefined };
}

/**
 * The order form sits on the product page itself (§7.1): variant, quantity, name, phone,
 * zone, landmark. No account, no cart, one tap to submit.
 */
export function OrderForm({ store, product }: { store: PublicStoreDto; product: PublicProductDto }) {
  const L = t(store.locale);
  const fmt = (n: number) => formatMoney(n, store.currency, store.locale);

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const first = product.variants.find((v) => v.available) ?? product.variants[0];
    return first ? { ...first.options } : {};
  });
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const variant = useMemo(
    () => product.variants.find((v) => product.options.every((o) => v.options[o] === selected[o])),
    [product, selected],
  );
  const unitPrice = variant?.price ?? product.price;
  const subtotal = priceForQuantity(unitPrice, quantity, product.quantityOffers);
  const zone = store.zones.find((z) => z.id === zoneId);
  const fee = zone ? deliveryFeeFor(zone, subtotal) : null;
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<{ code: string; type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING'; value: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const discount = promo ? promoDiscount(promo, subtotal, fee ?? 0) : 0;
  const total = subtotal + (fee ?? 0) - discount;
  const en = store.locale === 'en';
  const checkoutFired = useRef(false);

  async function applyPromo() {
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await fetch(`${API_URL}/public/stores/${store.slug}/promo/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoInput, subtotal, deliveryFee: fee ?? 0 }),
      });
      const data = await res.json();
      if (!res.ok) setPromoError(data.message ?? (en ? 'Invalid code' : 'Code invalide'));
      else setPromo({ code: data.code, type: data.type, value: data.value });
    } catch {
      setPromoError(en ? 'Network error' : 'Problème de connexion');
    } finally {
      setPromoBusy(false);
    }
  }
  const available = product.available && (product.variants.length === 0 || !!variant?.available);

  // Remember the customer's details for their next order on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('myabe.customer') ?? 'null');
      if (saved) {
        setName(saved.name ?? '');
        setPhone(saved.phone ?? '');
        setAddress(saved.address ?? '');
        if (store.zones.some((z) => z.id === saved.zoneId)) setZoneId(saved.zoneId);
      }
    } catch {
      /* ignore */
    }
  }, [store.zones]);

  const quantityChoices = [
    { quantity: 1, price: unitPrice },
    ...product.quantityOffers.map((o) => ({ quantity: o.quantity, price: o.price })),
  ];

  function locate() {
    if (!navigator.geolocation) return setGpsState('error');
    setGpsState('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        setGpsState('ok');
      },
      () => setGpsState('error'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function validate() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = L.required;
    if (phone.replace(/\D/g, '').length < 8) e.phone = L.phoneInvalid;
    if (!zoneId) e.zone = L.required;
    if (zoneId === 'OTHER' && otherCity.trim().length < 2) e.otherCity = L.required;
    if (address.trim().length < 2) e.address = L.required;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    if (!validate()) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSubmitting(true);
    const { source, utm } = detectSource(new URLSearchParams(window.location.search));
    try {
      const res = await fetch(`${API_URL}/public/stores/${store.slug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          variantId: variant?.id ?? null,
          quantity,
          customerName: name.trim(),
          customerPhone: phone,
          zoneId,
          city: zoneId === 'OTHER' ? otherCity.trim() : undefined,
          address: address.trim(),
          gps,
          note: note.trim() || null,
          source,
          utm,
          promoCode: promo?.code,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'INVALID_PHONE') setErrors({ phone: L.phoneInvalid });
        if (String(data.code ?? '').startsWith('PROMO_')) {
          setPromo(null);
          setPromoError(data.message);
        }
        setFormError(data.message ?? 'Erreur');
        setSubmitting(false);
        return;
      }
      const created = data as PublicOrderCreated;
      try {
        localStorage.setItem('myabe.customer', JSON.stringify({ name, phone, address, zoneId }));
      } catch {
        /* ignore */
      }
      window.location.href = `/t/${created.trackingToken}?new=1`;
    } catch {
      setFormError(store.locale === 'en' ? 'Network error, please try again.' : 'Problème de connexion, réessayez.');
      setSubmitting(false);
    }
  }

  if (store.closed) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="font-semibold">{L.closed}</p>
        {store.closedMessage && <p className="mt-1 text-sm">{store.closedMessage}</p>}
      </div>
    );
  }

  return (
    <>
      <form
        ref={formRef}
        id="commander"
        onSubmit={submit}
        noValidate
        onFocus={() => {
          if (checkoutFired.current) return;
          checkoutFired.current = true;
          fire({ name: 'InitiateCheckout', value: subtotal, currency: store.currency, contentId: product.id, contentName: product.title });
        }} className="scroll-mt-20 space-y-4 rounded-2xl border-2 store-border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{L.orderFormTitle}</h2>

        {product.options.map((option) => (
          <fieldset key={option}>
            <legend className="mb-1.5 text-sm font-medium">{option}</legend>
            <div className="flex flex-wrap gap-2">
              {[...new Set(product.variants.map((v) => v.options[option]).filter(Boolean))].map((value) => {
                const active = selected[option] === value;
                return (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={active}
                    onClick={() => setSelected((s) => ({ ...s, [option]: value! }))}
                    className={`tap rounded-xl border-2 px-4 text-sm font-semibold ${active ? 'store-border store-text bg-white' : 'border-line bg-canvas text-ink'}`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{L.quantity}</legend>
          {quantityChoices.length > 1 ? (
            <div className="grid gap-2">
              {quantityChoices.map((c) => {
                const active = quantity === c.quantity;
                const saving = c.quantity * unitPrice - c.price;
                return (
                  <button
                    type="button"
                    key={c.quantity}
                    aria-pressed={active}
                    onClick={() => setQuantity(c.quantity)}
                    className={`tap flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left ${active ? 'store-border bg-white' : 'border-line bg-canvas'}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex size-5 items-center justify-center rounded-full border-2 ${active ? 'store-border' : 'border-zinc-300'}`}>
                        {active && <span className="store-bg size-2.5 rounded-full" />}
                      </span>
                      <span className="font-semibold">
                        {c.quantity === 1 ? `1 ${L.each}` : `${L.forN(c.quantity)} ${fmt(c.price)}`}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      {c.quantity === 1 ? fmt(c.price) : saving > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{L.save} {fmt(saving)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" aria-label="−" className="tap size-11 rounded-xl border border-line bg-canvas text-xl" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span className="w-8 text-center text-lg font-semibold" aria-live="polite">
                {quantity}
              </span>
              <button type="button" aria-label="+" className="tap size-11 rounded-xl border border-line bg-canvas text-xl" onClick={() => setQuantity((q) => Math.min(50, q + 1))}>
                +
              </button>
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="of-name" className="mb-1.5 block text-sm font-medium">
            {L.fullName} *
          </label>
          <input id="of-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} className="tap w-full rounded-xl border border-line px-3.5 py-2.5 aria-[invalid=true]:border-red-500" />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="of-phone" className="mb-1.5 block text-sm font-medium">
            {L.phone} *
          </label>
          <div className="flex">
            <span className="tap flex items-center rounded-l-xl border border-r-0 border-line bg-canvas px-3 text-muted">+{store.dialCode}</span>
            <input
              id="of-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone}
              className="tap w-full min-w-0 rounded-r-xl border border-line px-3.5 py-2.5 aria-[invalid=true]:border-red-500"
            />
          </div>
          {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
        </div>

        <div>
          <label htmlFor="of-zone" className="mb-1.5 block text-sm font-medium">
            {L.city} *
          </label>
          <select id="of-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-invalid={!!errors.zone} className="tap w-full rounded-xl border border-line bg-white px-3.5 py-2.5 aria-[invalid=true]:border-red-500">
            <option value="">{L.chooseZone}</option>
            {store.zones.map((z) => {
              const zf = deliveryFeeFor(z, subtotal);
              return (
                <option key={z.id} value={z.id}>
                  {z.name === z.city ? z.name : `${z.city} – ${z.name}`} · {zf === 0 ? L.free : fmt(zf)}
                  {z.delay ? ` · ${z.delay}` : ''}
                </option>
              );
            })}
            <option value="OTHER">{L.otherZone}</option>
          </select>
          {errors.zone && <p className="mt-1 text-sm text-red-600">{errors.zone}</p>}
        </div>

        {zoneId === 'OTHER' && (
          <div>
            <label htmlFor="of-city" className="mb-1.5 block text-sm font-medium">
              {L.otherCity} *
            </label>
            <input id="of-city" value={otherCity} onChange={(e) => setOtherCity(e.target.value)} aria-invalid={!!errors.otherCity} className="tap w-full rounded-xl border border-line px-3.5 py-2.5" />
            {errors.otherCity && <p className="mt-1 text-sm text-red-600">{errors.otherCity}</p>}
          </div>
        )}

        <div>
          <label htmlFor="of-address" className="mb-1.5 block text-sm font-medium">
            {L.address} *
          </label>
          <input id="of-address" autoComplete="street-address" placeholder={L.addressPlaceholder} value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={!!errors.address} className="tap w-full rounded-xl border border-line px-3.5 py-2.5 aria-[invalid=true]:border-red-500" />
          {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address}</p>}
          <button type="button" onClick={locate} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium store-text">
            📍 {gpsState === 'ok' ? `${L.gpsOk} ✓` : gpsState === 'loading' ? '…' : L.useGps}
          </button>
        </div>

        <div>
          <label htmlFor="of-note" className="mb-1.5 block text-sm font-medium">
            {L.note}
          </label>
          <input id="of-note" value={note} onChange={(e) => setNote(e.target.value)} className="tap w-full rounded-xl border border-line px-3.5 py-2.5" />
        </div>

        {store.promoCodes && (
          <div>
            {promo ? (
              <p className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <span>
                  🎉 {en ? 'Code' : 'Code'} <strong>{promo.code}</strong> {en ? 'applied' : 'appliqué'}
                </span>
                <button type="button" className="underline" onClick={() => setPromo(null)}>
                  {en ? 'Remove' : 'Retirer'}
                </button>
              </p>
            ) : promoOpen ? (
              <div className="flex gap-2">
                <input
                  aria-label={en ? 'Promo code' : 'Code promo'}
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder={en ? 'Promo code' : 'Code promo'}
                  className="tap min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2.5 uppercase"
                />
                <button type="button" disabled={!promoInput || promoBusy} onClick={() => void applyPromo()} className="tap rounded-xl border-2 store-border px-4 text-sm font-semibold store-text disabled:opacity-50">
                  {promoBusy ? '…' : en ? 'Apply' : 'Appliquer'}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setPromoOpen(true)} className="min-h-11 text-sm font-medium store-text">
                🏷️ {en ? 'I have a promo code' : 'J’ai un code promo'}
              </button>
            )}
            {promoError && <p className="mt-1 text-sm text-red-600">{promoError}</p>}
          </div>
        )}

        <dl className="space-y-1 rounded-xl bg-canvas p-3 text-sm">
          <div className="flex justify-between">
            <dt>{L.subtotal}</dt>
            <dd>{fmt(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{L.delivery}</dt>
            <dd>{fee == null ? '—' : fee === 0 ? L.free : fmt(fee)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between font-medium text-emerald-700">
              <dt>{en ? 'Discount' : 'Remise'} ({promo?.code})</dt>
              <dd>−{fmt(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold">
            <dt>{L.total}</dt>
            <dd>{fmt(total)}</dd>
          </div>
        </dl>

        {formError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <button type="submit" disabled={submitting || !available} className="tap store-bg w-full rounded-xl py-3.5 text-lg font-bold text-white disabled:opacity-60">
          {!available ? L.outOfStock : submitting ? L.sending : `${L.order} · ${fmt(total)}`}
        </button>
        <p className="text-center text-xs text-muted">🔒 {L.codLong}</p>
      </form>

      {/* Sticky order button on mobile (§7.1). */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/95 p-3 backdrop-blur sm:hidden">
        <a href="#commander" className="tap store-bg flex w-full items-center justify-center rounded-xl py-3 text-base font-bold text-white">
          {L.order} · {fmt(total)}
        </a>
      </div>
    </>
  );
}
