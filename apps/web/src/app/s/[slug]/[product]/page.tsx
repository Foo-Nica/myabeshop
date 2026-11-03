import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicApi } from '@/lib/server-api';
import { ProductView, productMetadata } from '@/components/storefront/ProductView';
import { publicStoreUrl, storeBase } from '@/lib/store-url';

type Props = { params: Promise<{ slug: string; product: string }> };

export const revalidate = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, product } = await params;
  const data = await publicApi.product(slug, product);
  if (!data) return {};
  return productMetadata(data.store, data.product, `${publicStoreUrl(slug)}/${product}`);
}

export default async function ProductPage({ params }: Props) {
  const { slug, product } = await params;
  const data = await publicApi.product(slug, product);
  if (!data) notFound();
  const viaSubdomain = (await headers()).get('x-store-host') === '1';
  return <ProductView store={data.store} product={data.product} base={storeBase(slug, viaSubdomain)} />;
}
