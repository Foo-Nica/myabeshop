'use client';

import type { AuthResponse } from '@myabeshop/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ACCESS = 'myabe.access';
const REFRESH = 'myabe.refresh';
const STORE = 'myabe.store';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export const session = {
  get accessToken() {
    return read(ACCESS);
  },
  get refreshToken() {
    return read(REFRESH);
  },
  get storeId() {
    return read(STORE);
  },
  setStore(id: string | null) {
    write(STORE, id);
  },
  save(auth: Pick<AuthResponse, 'accessToken' | 'refreshToken'>) {
    write(ACCESS, auth.accessToken);
    write(REFRESH, auth.refreshToken);
  },
  clear() {
    write(ACCESS, null);
    write(REFRESH, null);
    write(STORE, null);
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const refreshToken = session.refreshToken;
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      session.save(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  const token = session.accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  if (res.status === 401 && retry && session.refreshToken) {
    if (await refresh()) return apiFetch<T>(path, init, false);
    session.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = (data.issues as { path: string; message: string }[] | undefined) ?? [];
    const message = issues.length ? issues.map((i) => `${i.path ? `${i.path} : ` : ''}${i.message}`).join(' · ') : (data.message ?? 'Une erreur est survenue');
    throw new ApiError(res.status, data.code ?? 'ERROR', message, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: 'POST', json: json ?? {} }),
  patch: <T>(path: string, json: unknown) => apiFetch<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: async (storeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<{ url: string }>(`/stores/${storeId}/uploads`, { method: 'POST', body: form });
  },
};
