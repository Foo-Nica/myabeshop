/** Storefront base path: subdomain requests are rewritten to /s/<slug> by the middleware, so links stay relative. */
export function storeBase(slug: string, viaSubdomain: boolean) {
  return viaSubdomain ? '' : `/s/${slug}`;
}

export const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

export function publicStoreUrl(slug: string) {
  return ROOT_DOMAIN.startsWith('localhost') ? `${WEB_URL}/s/${slug}` : `https://${slug}.${ROOT_DOMAIN}`;
}
