'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { formatMoney, type OrderSummaryDto } from '@myabeshop/shared/client';
import { SessionProvider, useSession } from '@/lib/session';
import { playChime, useStoreEvents } from '@/lib/realtime';
import { cx, Spinner } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'Accueil', icon: '🏠', perm: 'stats.read' },
  { href: '/dashboard/orders', label: 'Commandes', icon: '📦', perm: 'orders.read.assigned' },
  { href: '/dashboard/products', label: 'Produits', icon: '🏷️', perm: 'products.read' },
  { href: '/dashboard/zones', label: 'Livraison', icon: '🗺️', perm: 'zones.write' },
  { href: '/dashboard/couriers', label: 'Livreurs', icon: '🛵', perm: 'couriers.read' },
  { href: '/dashboard/deliveries', label: 'Mes colis', icon: '🛵', perm: 'deliveries.read.own' },
  { href: '/dashboard/settings', label: 'Boutique', icon: '⚙️', perm: 'store.update' },
] as const;

function Shell({ children }: { children: ReactNode }) {
  const { me, store, stores, loading, can, selectStore, logout } = useSession();
  const pathname = usePathname();
  const [toast, setToast] = useState<OrderSummaryDto | null>(null);

  useEffect(() => {
    if (!loading && !me) window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
    else if (!loading && me && stores.length === 0) window.location.href = '/onboarding';
  }, [loading, me, stores, pathname]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const ask = () => void Notification.requestPermission();
      window.addEventListener('click', ask, { once: true });
      return () => window.removeEventListener('click', ask);
    }
  }, []);

  useStoreEvents(store?.id, {
    onCreated: (o) => {
      playChime();
      setToast(o);
      setTimeout(() => setToast((t) => (t?.id === o.id ? null : t)), 8000);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(`Nouvelle commande n°${o.number}`, { body: `${o.customerName} · ${formatMoney(o.total, o.currency)}`, icon: '/icon.svg' });
      }
      window.dispatchEvent(new CustomEvent('myabe:order', { detail: o }));
    },
    onUpdated: (o) => window.dispatchEvent(new CustomEvent('myabe:order', { detail: o })),
  });

  if (loading || !me || !store) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-700">
        <Spinner className="size-6" />
      </div>
    );
  }

  const items = NAV.filter((n) => can(n.perm as never));
  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-dvh pb-20 lg:pb-0 lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-white lg:flex">
        <div className="p-4">
          <a href="/dashboard" className="flex items-center gap-2 font-extrabold text-brand-900">
            <img src="/icon.svg" alt="" width={28} height={28} /> Myabéshop
          </a>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((n) => (
            <a key={n.href} href={n.href} className={cx('tap flex items-center gap-3 rounded-xl px-3 font-medium', isActive(n.href) ? 'bg-brand-50 text-brand-900' : 'text-muted hover:bg-canvas')}>
              <span aria-hidden>{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="border-t border-line p-3 text-sm">
          <p className="truncate font-medium">{me.name}</p>
          <button onClick={() => void logout()} className="mt-1 text-muted underline">
            Se déconnecter
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
        {stores.length > 1 ? (
          <select aria-label="Boutique" value={store.id} onChange={(e) => selectStore(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent font-semibold lg:flex-none">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate font-semibold lg:flex-none">{store.name}</span>
        )}
        <a href={store.url} target="_blank" rel="noopener" className="ml-auto shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          Voir ma boutique ↗
        </a>
      </header>

      <main className="mx-auto max-w-5xl p-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-white lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 5)}, minmax(0, 1fr))` }}>
        {items.slice(0, 5).map((n) => (
          <a key={n.href} href={n.href} className={cx('flex min-h-14 flex-col items-center justify-center text-[11px] font-medium', isActive(n.href) ? 'text-brand-700' : 'text-muted')}>
            <span className="text-lg" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </a>
        ))}
      </nav>

      {toast && (
        <a href={`/dashboard/orders/${toast.id}`} role="status" className="animate-pop fixed top-16 right-4 left-4 z-30 rounded-2xl bg-brand-900 p-4 text-white shadow-xl sm:left-auto sm:w-80">
          <p className="font-bold">🔔 Nouvelle commande n°{toast.number}</p>
          <p className="text-sm text-white/85">
            {toast.customerName} · {toast.city} · {formatMoney(toast.total, toast.currency)}
          </p>
        </a>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
