'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { MeResponse } from '@myabeshop/shared/client';
import { api, session } from '@/lib/api';
import { cx, Spinner } from '@/components/ui';

const NAV = [
  { href: '/admin', label: 'Vue d’ensemble', icon: '📈' },
  { href: '/admin/stores', label: 'Boutiques', icon: '🏪' },
  { href: '/admin/plans', label: 'Plans', icon: '💳' },
  { href: '/admin/payments', label: 'Paiements', icon: '💰' },
  { href: '/admin/audit', label: 'Journal d’audit', icon: '🧾' },
];

/** Platform back-office (§9.2): super-admins only; the API checks it on every route. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!session.accessToken && !session.refreshToken) {
      window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
      return;
    }
    api
      .get<MeResponse>('/auth/me')
      .then((m) => (m.isSuperAdmin ? setMe(m) : (window.location.href = '/dashboard')))
      .catch(() => (window.location.href = '/login?next=/admin'));
  }, [pathname]);

  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-700">
        <Spinner className="size-6" />
      </div>
    );
  }
  const active = (href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

  return (
    <div className="min-h-dvh bg-canvas lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink text-white lg:flex">
        <div className="p-4">
          <p className="flex items-center gap-2 font-extrabold">
            <img src="/icon.svg" alt="" width={28} height={28} /> Myabéshop
          </p>
          <p className="mt-1 text-xs tracking-wider text-white/60 uppercase">Back-office</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={cx('tap flex items-center gap-3 rounded-xl px-3 font-medium', active(n.href) ? 'bg-white/15' : 'text-white/75 hover:bg-white/10')}>
              <span aria-hidden>{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-sm">
          <p className="truncate font-medium">{me.name}</p>
          {me.memberships.length > 0 && (
            <a href="/dashboard" className="mt-1 block text-white/70 underline">
              Mon tableau de bord marchand
            </a>
          )}
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 overflow-x-auto bg-ink px-3 text-white lg:hidden">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className={cx('shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold', active(n.href) ? 'bg-white/15' : 'text-white/75')}>
            {n.label}
          </a>
        ))}
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
