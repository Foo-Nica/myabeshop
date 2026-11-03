import { NextResponse, type NextRequest } from 'next/server';

const ROOT = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000').split(':')[0]!;
const APP_HOSTS = new Set([ROOT, `www.${ROOT}`, `app.${ROOT}`, 'localhost', '127.0.0.1']);
const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * maboutique.plateforme.com/xyz → /s/maboutique/xyz (§4, parcours A étape 3).
 * Custom domains are resolved through the API.
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').split(':')[0]!.toLowerCase();
  if (APP_HOSTS.has(host)) return NextResponse.next();

  let slug: string | null = null;
  if (host.endsWith(`.${ROOT}`)) {
    slug = host.slice(0, -(ROOT.length + 1));
  } else {
    try {
      const res = await fetch(`${API}/public/resolve?host=${encodeURIComponent(host)}`, { next: { revalidate: 300 } });
      if (res.ok) slug = ((await res.json()) as { slug: string }).slug;
    } catch {
      /* fall through */
    }
  }
  if (!slug) return NextResponse.next();

  const url = req.nextUrl.clone();
  const path = url.pathname;
  if (path.startsWith('/p/') || path.startsWith('/t/') || path.startsWith('/_next')) return NextResponse.next();
  url.pathname = `/s/${slug}${path === '/' ? '' : path}`;
  const headers = new Headers(req.headers);
  headers.set('x-store-host', '1');
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)'],
};
