import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicApi } from '@/lib/server-api';
import { ProductView, productMetadata } from '@/components/storefront/ProductView';
import { WEB_URL } from '@/lib/store-url';

type Props = { params: Promise<{ code: string }> };

export const revalidate = 30;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const data = await publicApi.byCode(code);
  if (!data) return {};
  return productMetadata(data.store, data.product, `${WEB_URL}/p/${code}`);
}

/** Short product link and ad landing page: no menu, order form first (§5.3). */
export default async function ShortLinkPage({ params }: Props) {
  const { code } = await params;
  const data = await publicApi.byCode(code);
  if (!data) notFound();
  return <ProductView store={data.store} product={data.product} base={`/s/${data.store.slug}`} landing />;
}
