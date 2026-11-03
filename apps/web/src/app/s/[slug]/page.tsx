import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { formatMoney } from '@myabeshop/shared/client';
import { publicApi } from '@/lib/server-api';
import { t } from '@/lib/storefront-i18n';
import { StoreFooter, StoreHeader, WhatsAppFloat } from '@/components/storefront/StoreHeader';
import { publicStoreUrl, storeBase } from '@/lib/store-url';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string }> };

export const revalidate = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await publicApi.store(slug);
  if (!store) return {};
  return {
    title: { absolute: store.name },
    description: store.description ?? `${store.name} · ${t(store.locale).cod}`,
    alternates: { canonical: publicStoreUrl(slug) },
    openGraph: { title: store.name, description: store.description ?? undefined, images: store.bannerUrl ?? store.logoUrl ?? undefined },
  };
}

export default async function StoreHome({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q } = await searchParams;
  const [store, products] = await Promise.all([publicApi.store(slug), publicApi.products(slug, q)]);
  if (!store) notFound();
  const L = t(store.locale);
  const base = storeBase(slug, (await headers()).get('x-store-host') === '1');

  return (
    <div style={{ ['--store' as string]: store.primaryColor }}>
      <StoreHeader store={store} base={base} />
      {store.bannerUrl ? (
        <img src={store.bannerUrl} alt="" className="aspect-[3/1] w-full object-cover" width={1200} height={400} />
      ) : (
        <div className="store-bg px-4 py-8 text-white">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-2xl font-bold">{store.name}</h1>
            {store.description && <p className="mt-1 max-w-xl text-white/90">{store.description}</p>}
          </div>
        </div>
      )}
      {store.closed && (
        <div className="bg-amber-100 px-4 py-3 text-center text-sm text-amber-900">{store.closedMessage ?? L.closed}</div>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{L.products}</h2>
          <form className="w-full sm:w-72" role="search">
            <input name="q" defaultValue={q} placeholder={L.search} aria-label={L.search} className="tap w-full rounded-xl border border-line bg-white px-3.5 py-2" />
          </form>
        </div>
        {!products || products.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-muted">{L.noProducts}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const discount = p.compareAtPrice && p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : null;
              return (
                <li key={p.id}>
                  <a href={`${base}/${p.slug}`} className="block overflow-hidden rounded-2xl border border-line bg-white">
                    <div className="relative aspect-square bg-zinc-100">
                      {p.images[0] && <img src={p.images[0]} alt="" loading="lazy" width={300} height={300} className="size-full object-cover" />}
                      {discount && <span className="absolute top-2 left-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">−{discount} %</span>}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                      <p className="store-text mt-1 font-bold">{formatMoney(p.price, store.currency, store.locale)}</p>
                      {!p.available && <p className="text-xs text-red-600">{L.outOfStock}</p>}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <WhatsAppFloat phone={store.whatsappPhone} />
      <StoreFooter store={store} base={base} />
    </div>
  );
}
