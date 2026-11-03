'use client';

import { useEffect, useState } from 'react';
import { formatMoney, type ProductDto } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, EmptyState, LinkButton } from '@/components/ui';

export default function ProductsPage() {
  const { store, can } = useSession();
  const [products, setProducts] = useState<ProductDto[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (store) void api.get<ProductDto[]>(`/stores/${store.id}/products`).then(setProducts);
  }, [store]);

  if (!store) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Produits</h1>
        {can('products.write') && <LinkButton href="/dashboard/products/new">＋ Nouveau produit</LinkButton>}
      </div>
      {products && products.length === 0 && (
        <EmptyState title="Aucun produit" action={<LinkButton href="/dashboard/products/new">Ajouter mon premier produit</LinkButton>}>
          Ajoutez des photos, un prix, et partagez le lien.
        </EmptyState>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {products?.map((p) => (
          <li key={p.id}>
            <Card className="flex gap-3 p-3">
              <a href={`/dashboard/products/${p.id}`} className="size-20 shrink-0 overflow-hidden rounded-xl bg-canvas">
                {p.images[0] && <img src={p.images[0]} alt="" className="size-full object-cover" />}
              </a>
              <div className="min-w-0 flex-1">
                <a href={`/dashboard/products/${p.id}`} className="line-clamp-2 font-semibold">
                  {p.title}
                </a>
                <p className="text-sm">
                  {formatMoney(p.price, store.currency)}
                  {p.trackStock && <span className="text-muted"> · stock {p.variants.length ? p.variants.reduce((s, v) => s + (v.stock ?? 0), 0) : (p.stock ?? 0)}</span>}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge className={p.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'}>{p.status === 'PUBLISHED' ? 'Publié' : p.status === 'DRAFT' ? 'Brouillon' : 'Archivé'}</Badge>
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 py-1 text-sm"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(p.shortUrl!).catch(() => undefined);
                      setCopied(p.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === p.id ? 'Lien copié ✓' : '🔗 Copier le lien'}
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
