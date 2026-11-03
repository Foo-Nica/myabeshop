import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { formatMoney, type OrderStatus } from '@myabeshop/shared/client';
import { publicApi } from '@/lib/server-api';
import { t } from '@/lib/storefront-i18n';
import { STATUS_LABEL } from '@/lib/labels';
import { WhatsAppIcon } from '@/components/storefront/StoreHeader';
import { Pixels } from '@/components/storefront/Pixels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const STEPS: OrderStatus[] = ['NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED'];

/** Thank-you and tracking page, reachable by link without logging in (§7.4). */
export default async function TrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string }> }) {
  const { token } = await params;
  const { new: isNew } = await searchParams;
  const order = await publicApi.track(token);
  if (!order) notFound();
  const locale = order.store.locale;
  const L = t(locale);
  const fmt = (n: number) => formatMoney(n, order.currency, locale);
  const label = (s: OrderStatus) => STATUS_LABEL[s][locale === 'en' ? 'en' : 'fr'];
  const reached = new Set(order.timeline.map((e) => e.status));
  const ended = ['CANCELLED', 'REFUSED', 'RETURNED'].includes(order.status);
  const wa = order.store.whatsappPhone
    ? `https://wa.me/${order.store.whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`${L.orderNumber}${order.number} – ${order.customerName}`)}`
    : null;

  return (
    <main style={{ ['--store' as string]: order.store.primaryColor }} className="mx-auto max-w-lg space-y-4 px-4 py-6">
      {isNew ? (
        <div className="animate-pop rounded-2xl bg-white p-5 text-center shadow-sm">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
          <h1 className="text-xl font-bold">{L.thanks}</h1>
          <p className="mt-1 text-muted">{L.thanksBody}</p>
          <p className="mt-3 text-sm font-semibold">
            {L.orderNumber}
            {order.number} · {order.store.name}
          </p>
        </div>
      ) : (
        <h1 className="text-xl font-bold">
          {L.trackTitle} {L.orderNumber}
          {order.number}
        </h1>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        {ended ? (
          <p className="font-semibold text-red-700">{label(order.status)}</p>
        ) : (
          <ol className="space-y-3">
            {STEPS.map((s) => {
              const done = reached.has(s) || STEPS.indexOf(order.status) >= STEPS.indexOf(s);
              return (
                <li key={s} className="flex items-center gap-3">
                  <span className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${done ? 'store-bg text-white' : 'bg-zinc-200 text-zinc-500'}`}>{done ? '✓' : ''}</span>
                  <span className={done ? 'font-semibold' : 'text-muted'}>{label(s)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-5 text-sm shadow-sm">
        {order.items.map((i, idx) => (
          <div key={idx} className="flex justify-between gap-3">
            <span>
              {i.quantity} × {i.title}
              {i.variantTitle ? ` (${i.variantTitle})` : ''}
            </span>
            <span>{fmt(i.total)}</span>
          </div>
        ))}
        <div className="flex justify-between text-muted">
          <span>{L.delivery}</span>
          <span>{order.deliveryFee === 0 ? L.free : fmt(order.deliveryFee)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>{locale === 'en' ? 'Discount' : 'Remise'}</span>
            <span>−{fmt(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
          <span>{L.total}</span>
          <span>{fmt(order.total)}</span>
        </div>
        <p className="pt-2 text-muted">
          📍 {order.city}, {order.address}
        </p>
      </section>

      {wa && (
        <a href={wa} target="_blank" rel="noopener" className="tap flex w-full items-center justify-center gap-2 rounded-xl bg-[#1fa855] py-3 font-bold text-white">
          <WhatsAppIcon className="size-5" /> {L.contactSeller}
        </a>
      )}
      <a href={`/s/${order.store.slug}`} className="block text-center text-sm underline">
        {order.store.name}
      </a>
      {isNew && <Pixels pixels={order.pixels} event={{ name: 'Purchase', value: order.total, currency: order.currency, eventId: `order-${token}` }} />}
    </main>
  );
}
