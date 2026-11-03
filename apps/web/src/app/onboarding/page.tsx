'use client';

import { useEffect, useState } from 'react';
import { COUNTRIES, STORE_CATEGORIES, type ProductDto, type StoreWithRole } from '@myabeshop/shared/client';
import { api, ApiError, session } from '@/lib/api';
import { CATEGORY_LABEL } from '@/lib/labels';
import { presetsFor } from '@/lib/zone-presets';
import { Alert, Button, Card, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { ShareLinks } from '@/components/dashboard/ShareLinks';

type ZoneRow = { name: string; city: string; fee: number | null; delay: string };
const STEPS = ['Boutique', 'Logo', 'Livraison', 'Produit', 'Partager'];

/** Parcours A: sign-up wizard, store live in under 10 minutes from a phone. */
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('CI');
  const [category, setCategory] = useState('other');
  const [whatsapp, setWhatsapp] = useState('');
  const [slug, setSlug] = useState<{ suggestion: string } | null>(null);
  const [store, setStore] = useState<StoreWithRole | null>(null);

  const [logo, setLogo] = useState<string[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const [compareAt, setCompareAt] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [product, setProduct] = useState<ProductDto | null>(null);

  useEffect(() => {
    if (!session.accessToken && !session.refreshToken) window.location.href = '/login?signup=1';
  }, []);

  useEffect(() => {
    if (name.trim().length < 2) return setSlug(null);
    const id = setTimeout(() => {
      api
        .get<{ suggestion: string }>(`/stores/slug-availability?name=${encodeURIComponent(name)}`)
        .then(setSlug)
        .catch(() => setSlug(null));
    }, 350);
    return () => clearTimeout(id);
  }, [name]);

  useEffect(() => setZones(presetsFor(country).map((z) => ({ ...z }))), [country]);

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

  const host = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'myabeshop.com').replace(/:\d+$/, '');

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <div className="mb-6">
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-line'}`} />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">
          Étape {step + 1} sur {STEPS.length} · {STEPS[step]}
        </p>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {step === 0 && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              let referralCode: string | undefined;
              try {
                referralCode = localStorage.getItem('myabe.ref') ?? undefined;
              } catch {
                /* ignore */
              }
              const created = await api.post<StoreWithRole>('/stores', { name, country, category, whatsappPhone: whatsapp || undefined, referralCode });
              session.setStore(created.id);
              setStore(created);
              setStep(1);
            });
          }}
        >
          <h1 className="text-2xl font-bold">Votre boutique</h1>
          <Field label="Nom de la boutique" htmlFor="name">
            <Input id="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Chez Awa Cosmétiques" />
          </Field>
          {slug && (
            <p className="-mt-2 text-sm text-muted">
              Votre adresse : <strong className="text-ink">{slug.suggestion}.{host}</strong>
            </p>
          )}
          <Field label="Pays" htmlFor="country">
            <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name.fr} · {c.currency === 'XOF' || c.currency === 'XAF' ? 'F CFA' : c.currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Catégorie" htmlFor="category">
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {STORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Numéro WhatsApp de la boutique" htmlFor="wa" hint="Facultatif">
            <Input id="wa" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </Field>
          <Button type="submit" block loading={loading}>
            Créer ma boutique
          </Button>
        </form>
      )}

      {step === 1 && store && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Ajoutez votre logo</h1>
          <p className="text-muted">Il apparaît en haut de votre boutique. Vous pouvez le faire plus tard.</p>
          <ImageUploader storeId={store.id} value={logo} onChange={setLogo} max={1} label="Logo" />
          <Button
            block
            loading={loading}
            onClick={() =>
              void run(async () => {
                if (logo[0]) await api.patch(`/stores/${store.id}`, { logoUrl: logo[0] });
                setStep(2);
              })
            }
          >
            {logo[0] ? 'Continuer' : 'Passer cette étape'}
          </Button>
        </div>
      )}

      {step === 2 && store && (
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Zones et frais de livraison</h1>
          <p className="text-muted">Le client choisit sa zone dans le formulaire et voit les frais tout de suite.</p>
          <div className="space-y-2">
            {zones.map((z, i) => (
              <Card key={i} className="grid grid-cols-[1fr_auto] gap-2 p-3">
                <Input aria-label="Zone" value={z.name} onChange={(e) => setZones((zs) => zs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <button type="button" aria-label="Supprimer la zone" className="tap px-2 text-muted" onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))}>
                  ✕
                </button>
                <Input aria-label="Ville" value={z.city} onChange={(e) => setZones((zs) => zs.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
                <span />
                <MoneyInput value={z.fee} currency={store.currency} onChange={(v) => setZones((zs) => zs.map((x, j) => (j === i ? { ...x, fee: v } : x)))} />
                <span />
              </Card>
            ))}
            <Button variant="ghost" onClick={() => setZones((zs) => [...zs, { name: '', city: zs[0]?.city ?? '', fee: 1000, delay: '24 h' }])}>
              ＋ Ajouter une zone
            </Button>
          </div>
          <Button
            block
            loading={loading}
            disabled={zones.length === 0}
            onClick={() =>
              void run(async () => {
                const valid = zones.filter((z) => z.name.trim().length >= 2 && z.city.trim().length >= 2);
                await api.post(`/stores/${store.id}/zones/bulk`, {
                  zones: valid.map((z, position) => ({ name: z.name.trim(), city: z.city.trim(), fee: z.fee ?? 0, delay: z.delay || null, position })),
                });
                setStep(3);
              })
            }
          >
            Enregistrer les zones
          </Button>
        </div>
      )}

      {step === 3 && store && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const created = await api.post<ProductDto>(`/stores/${store.id}/products`, {
                title,
                price: price ?? 0,
                compareAtPrice: compareAt,
                description,
                images,
                status: 'PUBLISHED',
              });
              setProduct(created);
              setStep(4);
            });
          }}
        >
          <h1 className="text-2xl font-bold">Votre premier produit</h1>
          <ImageUploader storeId={store.id} value={images} onChange={setImages} />
          <Field label="Nom du produit" htmlFor="title">
            <Input id="title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix" htmlFor="price">
              <MoneyInput id="price" value={price} currency={store.currency} onChange={setPrice} />
            </Field>
            <Field label="Prix barré" htmlFor="compare" hint="Facultatif">
              <MoneyInput id="compare" value={compareAt} currency={store.currency} onChange={setCompareAt} />
            </Field>
          </div>
          <Field label="Description" htmlFor="desc">
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Avantages, taille, utilisation…" />
          </Field>
          <Button type="submit" block loading={loading} disabled={!price}>
            Publier le produit
          </Button>
        </form>
      )}

      {step === 4 && store && product && (
        <div className="space-y-5">
          <div className="text-center">
            <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">🎉</div>
            <h1 className="text-2xl font-bold">Votre boutique est en ligne !</h1>
            <p className="text-muted">Partagez le lien de votre produit sur WhatsApp, Facebook ou TikTok.</p>
          </div>
          <Card>
            <p className="mb-2 font-semibold">{product.title}</p>
            <ShareLinks url={product.shortUrl!} title={product.title} />
          </Card>
          <Card>
            <p className="mb-2 font-semibold">Votre boutique</p>
            <ShareLinks url={store.url} title={store.name} />
          </Card>
          <Button block onClick={() => (window.location.href = '/dashboard')}>
            Aller au tableau de bord
          </Button>
        </div>
      )}
    </main>
  );
}
