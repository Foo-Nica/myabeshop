import { formatMoney, type PublicProductDto, type PublicStoreDto } from '@myabeshop/shared/client';
import { t } from '@/lib/storefront-i18n';
import { Gallery } from './Gallery';
import { OrderForm } from './OrderForm';
import { StoreFooter, StoreHeader, WhatsAppFloat } from './StoreHeader';

/**
 * Product page and ad landing page (§5.3, §7.1). Server-rendered; the only client JS is the order form.
 * `landing` hides the store menu so ad traffic stays focused on ordering.
 */
export function ProductView({ store, product, base, landing = false }: { store: PublicStoreDto; product: PublicProductDto; base: string; landing?: boolean }) {
  const L = t(store.locale);
  const fmt = (n: number) => formatMoney(n, store.currency, store.locale);
  const discount = product.compareAtPrice && product.compareAtPrice > product.price ? Math.round((1 - product.price / product.compareAtPrice) * 100) : null;
  const delays = [...new Set(store.zones.map((z) => z.delay).filter(Boolean))];

  return (
    <div style={{ ['--store' as string]: store.primaryColor }} className="pb-24 sm:pb-0">
      {!landing && <StoreHeader store={store} base={base} />}
      {landing && (
        <div className="store-bg px-4 py-2 text-center text-sm font-semibold text-white">
          🚚 {L.cod} · {store.name}
        </div>
      )}
      <main className="mx-auto max-w-5xl sm:grid sm:grid-cols-2 sm:gap-8 sm:px-4 sm:pt-6">
        <div className="sm:sticky sm:top-20 sm:self-start sm:overflow-hidden sm:rounded-2xl">
          <Gallery images={product.images} title={product.title} />
        </div>
        <div className="space-y-5 px-4 pt-4 sm:px-0 sm:pt-0">
          <div>
            <h1 className="text-2xl leading-tight font-bold">{product.title}</h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="store-text text-2xl font-extrabold">{fmt(product.price)}</span>
              {discount && (
                <>
                  <span className="text-muted line-through">{fmt(product.compareAtPrice!)}</span>
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm font-bold text-white">−{discount} %</span>
                </>
              )}
            </div>
          </div>

          <ul className="grid grid-cols-1 gap-2 text-sm">
            <li className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900">💵 <strong>{L.cod}</strong></li>
            {delays.length > 0 && (
              <li className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sky-900">
                🚚 {L.deliveryIn} : {delays.join(' · ')}
              </li>
            )}
          </ul>

          <OrderForm store={store} product={product} />

          {product.description && (
            <section className="prose-sm whitespace-pre-line text-[15px] leading-relaxed text-ink/90">{product.description}</section>
          )}
        </div>
      </main>
      <WhatsAppFloat phone={store.whatsappPhone} text={`${product.title}`} />
      {!landing && <StoreFooter store={store} base={base} />}
    </div>
  );
}

export function productMetadata(store: PublicStoreDto, product: PublicProductDto, url: string) {
  const price = formatMoney(product.price, store.currency, store.locale);
  const description = `${price} · ${t(store.locale).cod} · ${store.name}`;
  return {
    title: product.title,
    description,
    alternates: { canonical: url },
    // Rich preview when the link is pasted in WhatsApp or Facebook (§5.3).
    openGraph: {
      title: `${product.title} – ${price}`,
      description: product.description.slice(0, 180) || description,
      url,
      siteName: store.name,
      type: 'website' as const,
      images: product.images.slice(0, 1).map((src) => ({ url: src, width: 1200, height: 1200 })),
    },
    twitter: { card: 'summary_large_image' as const },
  };
}
