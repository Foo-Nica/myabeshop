'use client';

import { useState } from 'react';
import { formatMoney, type ProductDto, type ProductStatus } from '@myabeshop/shared/client';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Card, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui';
import { ImageUploader } from './ImageUploader';
import { ShareLinks } from './ShareLinks';

type VariantRow = { id?: string; options: Record<string, string>; price: number | null; stock: number | null; sku: string };
type OfferRow = { quantity: number; price: number | null };

/** Builds every combination of option values: Taille [S, M] × Couleur [Noir] → S/Noir, M/Noir. */
function combinations(options: { name: string; values: string[] }[]): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>(
    (acc, o) => acc.flatMap((combo) => o.values.map((v) => ({ ...combo, [o.name]: v }))),
    [{}],
  );
}

export function ProductForm({ storeId, currency, product }: { storeId: string; currency: string; product?: ProductDto }) {
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState<number | null>(product?.price ?? null);
  const [compareAt, setCompareAt] = useState<number | null>(product?.compareAtPrice ?? null);
  const [cost, setCost] = useState<number | null>(product?.cost ?? null);
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'PUBLISHED');
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false);
  const [stock, setStock] = useState<number | null>(product?.stock ?? null);
  const [options, setOptions] = useState<{ name: string; values: string[] }[]>(
    () => product?.options.map((name) => ({ name, values: [...new Set(product.variants.map((v) => v.options[name]).filter(Boolean) as string[])] })) ?? [],
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.map((v) => ({ id: v.id, options: v.options, price: v.price, stock: v.stock, sku: v.sku ?? '' })) ?? [],
  );
  const [offers, setOffers] = useState<OfferRow[]>(product?.quantityOffers.map((o) => ({ quantity: o.quantity, price: o.price })) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ProductDto | null>(product ?? null);
  const [loading, setLoading] = useState(false);

  function regenerate(next: { name: string; values: string[] }[]) {
    setOptions(next);
    const valid = next.filter((o) => o.name.trim() && o.values.length > 0);
    if (valid.length === 0) return setVariants([]);
    setVariants((prev) =>
      combinations(valid).map((combo) => {
        const existing = prev.find((v) => valid.every((o) => v.options[o.name] === combo[o.name]));
        return existing ? { ...existing, options: combo } : { options: combo, price: null, stock: null, sku: '' };
      }),
    );
  }

  const margin = price && cost ? Math.round(((price - cost) / price) * 100) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const validOptions = options.filter((o) => o.name.trim() && o.values.length > 0);
    const body = {
      title,
      description,
      price: price ?? 0,
      compareAtPrice: compareAt,
      cost,
      images,
      status,
      trackStock,
      stock: trackStock && variants.length === 0 ? stock : null,
      options: validOptions.map((o) => o.name.trim()),
      variants: variants.map((v) => ({ id: v.id, options: v.options, price: v.price, stock: trackStock ? v.stock : null, sku: v.sku || null })),
      quantityOffers: offers.filter((o) => o.quantity >= 2 && o.price).map((o) => ({ quantity: o.quantity, price: o.price! })),
    };
    try {
      const res = product ? await api.patch<ProductDto>(`/stores/${storeId}/products/${product.id}`, body) : await api.post<ProductDto>(`/stores/${storeId}/products`, body);
      if (!product) window.location.href = `/dashboard/products/${res.id}?created=1`;
      else setSaved(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {saved && (
        <Card>
          <p className="mb-2 font-semibold">Lien du produit</p>
          <ShareLinks url={saved.shortUrl!} title={saved.title} />
        </Card>
      )}
      <Card className="space-y-4">
        <ImageUploader storeId={storeId} value={images} onChange={setImages} />
        <Field label="Nom du produit" htmlFor="title">
          <Input id="title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="desc">
          <Textarea id="desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label="Prix" htmlFor="price">
          <MoneyInput id="price" value={price} currency={currency} onChange={setPrice} />
        </Field>
        <Field label="Prix barré" htmlFor="cmp" hint="Facultatif">
          <MoneyInput id="cmp" value={compareAt} currency={currency} onChange={setCompareAt} />
        </Field>
        <Field label="Coût d’achat" htmlFor="cost" hint={margin != null ? `Marge ${margin} %` : 'Privé'}>
          <MoneyInput id="cost" value={cost} currency={currency} onChange={setCost} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Offres par quantité</p>
          <p className="text-sm text-muted">Ex. : 2 pour 18 000 F. Affichées en cartes sur la page produit.</p>
        </div>
        {offers.map((o, i) => (
          <div key={i} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2">
            <Input aria-label="Quantité" type="number" min={2} max={100} value={o.quantity} onChange={(e) => setOffers((os) => os.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
            <MoneyInput value={o.price} currency={currency} onChange={(v) => setOffers((os) => os.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
            <button type="button" aria-label="Retirer l’offre" className="tap px-2 text-muted" onClick={() => setOffers((os) => os.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        {offers.length < 5 && (
          <Button type="button" variant="ghost" onClick={() => setOffers((os) => [...os, { quantity: (os.at(-1)?.quantity ?? 1) + 1, price: price ? price * ((os.at(-1)?.quantity ?? 1) + 1) * 0.9 : null }])}>
            ＋ Ajouter une offre
          </Button>
        )}
        {price != null && offers.length > 0 && (
          <p className="text-xs text-muted">
            {offers.filter((o) => o.price).map((o) => `${o.quantity} pour ${formatMoney(o.price!, currency)}`).join(' · ')}
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="font-semibold">Variantes</p>
          <p className="text-sm text-muted">Jusqu’à 3 options (taille, couleur…), séparez les valeurs par des virgules.</p>
        </div>
        {options.map((o, i) => (
          <div key={i} className="grid grid-cols-[8rem_1fr_auto] gap-2">
            <Input aria-label="Option" placeholder="Taille" value={o.name} onChange={(e) => regenerate(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input
              aria-label="Valeurs"
              placeholder="S, M, L"
              defaultValue={o.values.join(', ')}
              onBlur={(e) => regenerate(options.map((x, j) => (j === i ? { ...x, values: [...new Set(e.target.value.split(',').map((v) => v.trim()).filter(Boolean))] } : x)))}
            />
            <button type="button" aria-label="Retirer l’option" className="tap px-2 text-muted" onClick={() => regenerate(options.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        {options.length < 3 && (
          <Button type="button" variant="ghost" onClick={() => setOptions((os) => [...os, { name: '', values: [] }])}>
            ＋ Ajouter une option
          </Button>
        )}
        {variants.length > 0 && (
          <div className="divide-y divide-line rounded-xl border border-line">
            {variants.map((v, i) => (
              <div key={Object.values(v.options).join('/')} className="grid grid-cols-2 items-center gap-2 p-2 sm:grid-cols-[1fr_9rem_6rem_7rem]">
                <span className="col-span-2 text-sm font-medium sm:col-span-1">{Object.values(v.options).join(' / ')}</span>
                <MoneyInput value={v.price} currency={currency} placeholder="Prix du produit" onChange={(val) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, price: val } : x)))} />
                {trackStock && <Input aria-label="Stock" type="number" min={0} placeholder="Stock" value={v.stock ?? ''} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, stock: e.target.value === '' ? null : Number(e.target.value) } : x)))} />}
                <Input aria-label="SKU" placeholder="SKU" value={v.sku} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-5" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          <span className="font-semibold">Suivre le stock</span>
        </label>
        {trackStock && variants.length === 0 && (
          <Field label="Quantité en stock" htmlFor="stock">
            <Input id="stock" type="number" min={0} value={stock ?? ''} onChange={(e) => setStock(e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        )}
        <p className="text-xs text-muted">Le stock baisse quand une commande est confirmée, et remonte si elle est annulée.</p>
      </Card>

      <Card className="flex flex-wrap items-end gap-3">
        <Field label="Statut" htmlFor="status">
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            <option value="PUBLISHED">Publié</option>
            <option value="DRAFT">Brouillon</option>
            <option value="ARCHIVED">Archivé</option>
          </Select>
        </Field>
        <Button type="submit" loading={loading} disabled={!price} className="ml-auto">
          {product ? 'Enregistrer' : 'Créer le produit'}
        </Button>
      </Card>
    </form>
  );
}
