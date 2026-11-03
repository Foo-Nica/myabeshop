'use client';

import { useSession } from '@/lib/session';
import { ProductForm } from '@/components/dashboard/ProductForm';

export default function NewProductPage() {
  const { store } = useSession();
  if (!store) return null;
  return (
    <div className="space-y-4">
      <a href="/dashboard/products" className="text-sm text-muted">← Produits</a>
      <h1 className="text-xl font-bold">Nouveau produit</h1>
      <ProductForm storeId={store.id} currency={store.currency} />
    </div>
  );
}
