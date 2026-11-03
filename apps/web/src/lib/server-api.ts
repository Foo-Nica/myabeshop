import 'server-only';
import type { PlanDto, PublicProductDto, PublicStoreDto, PublicTrackingDto } from '@myabeshop/shared';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function get<T>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    return (await res.json()) as T;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export const publicApi = {
  store: (slug: string) => get<PublicStoreDto>(`/public/stores/${encodeURIComponent(slug)}`),
  products: (slug: string, search?: string) =>
    get<PublicProductDto[]>(`/public/stores/${encodeURIComponent(slug)}/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  product: (slug: string, productSlug: string) =>
    get<{ store: PublicStoreDto; product: PublicProductDto }>(
      `/public/stores/${encodeURIComponent(slug)}/products/${encodeURIComponent(productSlug)}`,
    ),
  byCode: (code: string) => get<{ store: PublicStoreDto; product: PublicProductDto }>(`/public/p/${encodeURIComponent(code)}`),
  track: (token: string) => get<PublicTrackingDto>(`/public/track/${encodeURIComponent(token)}`, 0),
  plans: () => get<PlanDto[]>('/plans', 300),
  resolveHost: (host: string) => get<{ slug: string }>(`/public/resolve?host=${encodeURIComponent(host)}`, 300),
};
