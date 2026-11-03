import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { publicApi } from '@/lib/server-api';
import { t } from '@/lib/storefront-i18n';
import { StoreFooter, StoreHeader } from '@/components/storefront/StoreHeader';
import { storeBase } from '@/lib/store-url';

export default async function AboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await publicApi.store(slug);
  if (!store) notFound();
  const base = storeBase(slug, (await headers()).get('x-store-host') === '1');
  return (
    <div style={{ ['--store' as string]: store.primaryColor }}>
      <StoreHeader store={store} base={base} />
      <main className="mx-auto max-w-2xl space-y-3 px-4 py-8">
        <h1 className="text-2xl font-bold">{t(store.locale).about}</h1>
        <p className="whitespace-pre-line">{store.description ?? store.name}</p>
        {store.address && <p>📍 {store.address}</p>}
        {store.openingHours && <p>🕒 {store.openingHours}</p>}
        {store.phone && <p>☎ {store.phone}</p>}
        {Object.entries(store.social).map(([k, v]) => (
          <p key={k}>
            <a className="store-text underline" href={v} rel="noopener">{k}</a>
          </p>
        ))}
      </main>
      <StoreFooter store={store} base={base} />
    </div>
  );
}
