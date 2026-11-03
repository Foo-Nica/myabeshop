'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { roleHas, type MeResponse, type Permission, type StoreWithRole } from '@myabeshop/shared/client';
import { api, session } from './api';

interface SessionValue {
  me: MeResponse | null;
  stores: StoreWithRole[];
  store: StoreWithRole | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  selectStore: (id: string) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [stores, setStores] = useState<StoreWithRole[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!session.accessToken && !session.refreshToken) {
      setLoading(false);
      return;
    }
    try {
      const [meRes, storesRes] = await Promise.all([api.get<MeResponse>('/auth/me'), api.get<StoreWithRole[]>('/stores')]);
      setMe(meRes);
      setStores(storesRes);
      const saved = session.storeId;
      const current = storesRes.find((s) => s.id === saved) ?? storesRes[0] ?? null;
      setStoreId(current?.id ?? null);
      if (current) session.setStore(current.id);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const store = stores.find((s) => s.id === storeId) ?? null;

  const value: SessionValue = {
    me,
    stores,
    store,
    loading,
    can: (p) => (store ? roleHas(store.role, p) : false),
    selectStore: (id) => {
      session.setStore(id);
      setStoreId(id);
    },
    reload,
    logout: async () => {
      const rt = session.refreshToken;
      session.clear();
      if (rt) await api.post('/auth/logout', { refreshToken: rt }).catch(() => undefined);
      window.location.href = '/login';
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
