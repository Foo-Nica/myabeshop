import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { formatMoney } from '@myabeshop/shared/client';
import { publicApi } from '@/lib/server-api';
import { t } from '@/lib/storefront-i18n';
import { StoreFooter, StoreHeader } from '@/components/storefront/StoreHeader';
import { storeBase } from '@/lib/store-url';

export default async function DeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await publicApi.store(slug);
  if (!store) notFound();
  const L = t(store.locale);
  const base = storeBase(slug, (await headers()).get('x-store-host') === '1');
  return (
    <div style={{ ['--store' as string]: store.primaryColor }}>
      <StoreHeader store={store} base={base} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold">{L.deliveryPolicy}</h1>
        <p>💵 {L.codLong}.</p>
        <table className="w-full overflow-hidden rounded-xl bg-white text-sm">
          <tbody>
            {store.zones.map((z) => (
              <tr key={z.id} className="border-b border-line last:border-0">
                <td className="p-3">{z.name === z.city ? z.name : `${z.city} – ${z.name}`}</td>
                <td className="p-3 text-right font-semibold">{z.fee === 0 ? L.free : formatMoney(z.fee, store.currency, store.locale)}</td>
                <td className="p-3 text-right text-muted">{z.delay ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {store.deliveryPolicy && <p className="whitespace-pre-line">{store.deliveryPolicy}</p>}
        {store.returnPolicy && <p className="whitespace-pre-line">{store.returnPolicy}</p>}
      </main>
      <StoreFooter store={store} base={base} />
    </div>
  );
}
