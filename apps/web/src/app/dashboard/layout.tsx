'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { formatMoney, type BillingOverview, type OrderSummaryDto } from '@myabeshop/shared/client';
import { SessionProvider, useSession } from '@/lib/session';
import { api, session } from '@/lib/api';
import { playChime, useStoreEvents } from '@/lib/realtime';
import { cx, Spinner } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'Accueil', icon: '🏠', perm: 'stats.read' },
  { href: '/dashboard/orders', label: 'Commandes', icon: '📦', perm: 'orders.read.assigned' },
  { href: '/dashboard/products', label: 'Produits', icon: '🏷️', perm: 'products.read' },
  { href: '/dashboard/couriers', label: 'Livreurs', icon: '🛵', perm: 'couriers.read' },
  { href: '/livreur', label: 'Mes colis', icon: '🛵', perm: 'deliveries.read.own' },
  { href: '/dashboard/stats', label: 'Statistiques', icon: '📊', perm: 'stats.read' },
  { href: '/dashboard/marketing', label: 'Marketing', icon: '📣', perm: 'marketing.manage' },
  { href: '/dashboard/zones', label: 'Livraison', icon: '🗺️', perm: 'zones.write' },
  { href: '/dashboard/billing', label: 'Abonnement', icon: '💳', perm: 'billing.manage' },
  { href: '/dashboard/settings', label: 'Boutique', icon: '⚙️', perm: 'store.update' },
] as const;

type PlanStatus = Pick<BillingOverview, 'plan' | 'subscription' | 'daysLeft' | 'lockedOrders'>;

/** Plan reminders: trial ending, grace period, orders locked by the quota (§9.1). */
function PlanBanner({ status }: { status: PlanStatus | null }) {
  if (!status) return null;
  const { subscription: sub, daysLeft, lockedOrders, plan } = status;
  let text: string | null = null;
  let tone = 'bg-amber-50 text-amber-950 border-amber-200';
  if (lockedOrders > 0) {
    text = `${lockedOrders} commande(s) en attente : la limite mensuelle du plan ${plan.name} est atteinte.`;
    tone = 'bg-red-50 text-red-900 border-red-200';
  } else if (sub?.status === 'PAST_DUE') {
    text = `Votre abonnement ${plan.name} a expiré. Il reste actif jusqu’au ${new Date(sub.graceEndsAt!).toLocaleDateString('fr-FR')}, puis la boutique passe au plan Gratuit.`;
    tone = 'bg-red-50 text-red-900 border-red-200';
  } else if (sub?.status === 'TRIALING' && daysLeft != null && daysLeft <= 5) {
    text = `Essai Pro : plus que ${daysLeft} jour(s). Choisissez un plan pour garder vos fonctionnalités.`;
  } else if (sub?.status === 'ACTIVE' && daysLeft != null && daysLeft <= 3) {
    text = `Votre abonnement ${plan.name} se termine dans ${daysLeft} jour(s).`;
  }
  if (!text) return null;
  return (
    <a href="/dashboard/billing" className={cx('mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium', tone)}>
      <span>{text}</span>
      <span className="shrink-0 font-bold underline">Choisir un plan</span>
    </a>
  );
}

/** Support session opened from the back-office: the token carries the admin id. */
function impersonatedBy(): string | null {
  try {
    const token = session.accessToken;
    if (!token) return null;
    return (JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { imp?: string }).imp ?? null;
  } catch {
    return null;
  }
}

function Shell({ children }: { children: ReactNode }) {
  const { me, store, stores, loading, can, selectStore, logout } = useSession();
  const pathname = usePathname();
  const [toast, setToast] = useState<OrderSummaryDto | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [support, setSupport] = useState<string | null>(null);

  useEffect(() => setSupport(impersonatedBy()), []);
  useEffect(() => {
    if (store && can('billing.manage')) void api.get<BillingOverview>(`/stores/${store.id}/billing`).then(setPlanStatus).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);
  useEffect(() => {
    // Couriers use the dedicated offline app.
    if (store && store.role === 'COURIER') window.location.href = '/livreur';
  }, [store]);

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

  // "Mes colis" is the courier's own view; owners have the permission but not the role.
  const items = NAV.filter((n) => can(n.perm as never) && (n.href !== '/livreur' || store.role === 'COURIER'));
  const bottom = items.length > 5 ? items.slice(0, 4) : items;
  const more = items.length > 5 ? items.slice(4) : [];
  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-dvh pb-20 lg:pb-0 lg:pl-60 print:p-0">
      <aside className="fixed inset-y-0 left-0 hidden w-60 print:!hidden flex-col border-r border-line bg-white lg:flex">
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
          {me.isSuperAdmin && (
            <a href="/admin" className="mb-2 block font-semibold text-brand-700">
              Back-office →
            </a>
          )}
          <p className="truncate font-medium">{me.name}</p>
          <button onClick={() => void logout()} className="mt-1 text-muted underline">
            Se déconnecter
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 print:hidden items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
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

      {support && (
        <div className="bg-purple-700 px-4 py-2 text-center text-sm font-semibold text-white">
          Session support (30 min) ouverte depuis le back-office — chaque action est journalisée.{' '}
          <button
            className="underline"
            onClick={() => {
              try {
                const backup = JSON.parse(localStorage.getItem('myabe.admin.backup') ?? 'null');
                localStorage.removeItem('myabe.admin.backup');
                if (backup) session.save(backup);
                else session.clear();
              } catch {
                session.clear();
              }
              window.location.href = '/admin';
            }}
          >
            Revenir au back-office
          </button>
        </div>
      )}

      <main className="mx-auto max-w-5xl p-4">
        <div className="print:hidden">
          <PlanBanner status={planStatus} />
        </div>
        {children}
      </main>

      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="animate-pop absolute inset-x-3 bottom-20 rounded-2xl bg-white p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {more.map((n) => (
              <a key={n.href} href={n.href} className={cx('tap flex items-center gap-3 rounded-xl px-3 font-medium', isActive(n.href) ? 'bg-brand-50 text-brand-900' : 'text-ink')}>
                <span aria-hidden>{n.icon}</span> {n.label}
              </a>
            ))}
            {me.isSuperAdmin && (
              <a href="/admin" className="tap flex items-center gap-3 rounded-xl px-3 font-medium text-brand-700">
                <span aria-hidden>🛡️</span> Back-office
              </a>
            )}
            <button onClick={() => void logout()} className="tap flex w-full items-center gap-3 rounded-xl px-3 text-left font-medium text-muted">
              <span aria-hidden>↩</span> Se déconnecter
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 grid print:hidden border-t border-line bg-white lg:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length + (more.length ? 1 : 0)}, minmax(0, 1fr))` }}>
        {bottom.map((n) => (
          <a key={n.href} href={n.href} className={cx('flex min-h-14 flex-col items-center justify-center text-[11px] font-medium', isActive(n.href) ? 'text-brand-700' : 'text-muted')}>
            <span className="text-lg" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </a>
        ))}
        {more.length > 0 && (
          <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className={cx('flex min-h-14 flex-col items-center justify-center text-[11px] font-medium', more.some((n) => isActive(n.href)) ? 'text-brand-700' : 'text-muted')}>
            <span className="text-lg" aria-hidden>
              ☰
            </span>
            Plus
          </button>
        )}
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
