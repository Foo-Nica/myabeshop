'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type OrderDetailDto, type ProductDto, type ZoneDto } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

/** Order received by phone, typed in by the merchant (§6.1). */
export default function NewOrderPage() {
  const { store } = useSession();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [zones, setZones] = useState<ZoneDto[]>([]);
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customerName, setName] = useState('');
  const [customerPhone, setPhone] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!store) return;
    void api.get<ProductDto[]>(`/stores/${store.id}/products`).then(setProducts);
    void api.get<ZoneDto[]>(`/stores/${store.id}/zones`).then(setZones);
  }, [store]);

  const product = products.find((p) => p.id === productId);
  if (!store) return null;

  return (
    <form
      className="mx-auto max-w-lg space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
          const o = await api.post<OrderDetailDto>(`/stores/${store.id}/orders`, {
            productId,
            variantId: variantId || null,
            quantity,
            customerName,
            customerPhone,
            zoneId,
            address,
            note: note || null,
            source: 'manual',
          });
          window.location.href = `/dashboard/orders/${o.id}`;
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Erreur');
          setLoading(false);
        }
      }}
    >
      <a href="/dashboard/orders" className="text-sm text-muted">
        ← Commandes
      </a>
      <h1 className="text-xl font-bold">Nouvelle commande par téléphone</h1>
      {error && <Alert>{error}</Alert>}
      <Field label="Produit" htmlFor="p">
        <Select id="p" required value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(''); }}>
          <option value="">Choisir…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {formatMoney(p.price, store.currency)}
            </option>
          ))}
        </Select>
      </Field>
      {product && product.variants.length > 0 && (
        <Field label="Variante" htmlFor="v">
          <Select id="v" required value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Choisir…</option>
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Quantité" htmlFor="q">
        <Input id="q" type="number" min={1} max={50} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
      </Field>
      <Field label="Nom du client" htmlFor="n">
        <Input id="n" required minLength={2} value={customerName} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Téléphone" htmlFor="t">
        <Input id="t" type="tel" required value={customerPhone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Zone" htmlFor="z">
        <Select id="z" required value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Choisir…</option>
          {zones.filter((z) => z.active).map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} · {formatMoney(z.fee, store.currency)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Adresse / repère" htmlFor="a">
        <Input id="a" required minLength={2} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="no" hint="Facultatif">
        <Input id="no" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" block loading={loading}>
        Enregistrer la commande
      </Button>
    </form>
  );
}
