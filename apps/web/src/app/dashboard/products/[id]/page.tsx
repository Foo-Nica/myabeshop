'use client';

import { use, useEffect, useState } from 'react';
import type { ProductDto } from '@myabeshop/shared/client';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Spinner } from '@/components/ui';
import { ProductForm } from '@/components/dashboard/ProductForm';

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { store, can } = useSession();
  const [product, setProduct] = useState<ProductDto | null>(null);

  useEffect(() => {
    if (store) void api.get<ProductDto>(`/stores/${store.id}/products/${id}`).then(setProduct);
  }, [store, id]);

  if (!store || !product) return <div className="flex justify-center py-10 text-brand-700"><Spinner className="size-6" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <a href="/dashboard/products" className="text-sm text-muted">← Produits</a>
        {can('products.write') && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={async () => { const copy = await api.post<ProductDto>(`/stores/${store.id}/products/${id}/duplicate`); window.location.href = `/dashboard/products/${copy.id}`; }}>
              Dupliquer
            </Button>
            <Button variant="ghost" onClick={async () => { if (confirm('Supprimer ce produit ? S’il a des commandes, il sera archivé.')) { await api.delete(`/stores/${store.id}/products/${id}`); window.location.href = '/dashboard/products'; } }}>
              Supprimer
            </Button>
          </div>
        )}
      </div>
      <h1 className="text-xl font-bold">{product.title}</h1>
      <ProductForm storeId={store.id} currency={store.currency} product={product} />
    </div>
  );
}
