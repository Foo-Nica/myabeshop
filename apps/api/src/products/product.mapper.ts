import type { Product, ProductVariant, QuantityOffer } from '@prisma/client';
import type { ProductDto, PublicProductDto } from '@myabeshop/shared';
import { productShortUrl } from '../common/config';

export type ProductWithRelations = Product & { variants: ProductVariant[]; quantityOffers: QuantityOffer[] };

export const productInclude = {
  variants: { orderBy: { position: 'asc' as const } },
  quantityOffers: { orderBy: { quantity: 'asc' as const } },
};

export function toProductDto(p: ProductWithRelations): ProductDto {
  return {
    id: p.id,
    storeId: p.storeId,
    title: p.title,
    slug: p.slug,
    shortCode: p.shortCode,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    cost: p.cost,
    status: p.status,
    images: p.images,
    videoUrl: p.videoUrl,
    options: p.options,
    trackStock: p.trackStock,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    variants: p.variants.map((v) => ({
      id: v.id,
      options: v.options as Record<string, string>,
      title: v.title,
      price: v.price,
      stock: v.stock,
      sku: v.sku,
    })),
    quantityOffers: p.quantityOffers.map((o) => ({ id: o.id, quantity: o.quantity, price: o.price, label: o.label })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    shortUrl: productShortUrl(p.shortCode),
  };
}

/** Storefront view: hides cost, stock levels and SKUs. */
export function toPublicProductDto(p: ProductWithRelations): PublicProductDto {
  const variantAvailable = (v: ProductVariant) => !p.trackStock || v.stock == null || v.stock > 0;
  const available = p.trackStock
    ? p.variants.length > 0
      ? p.variants.some(variantAvailable)
      : p.stock == null || p.stock > 0
    : true;
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    shortCode: p.shortCode,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    status: p.status,
    images: p.images,
    videoUrl: p.videoUrl,
    options: p.options,
    available,
    variants: p.variants.map((v) => ({
      id: v.id,
      options: v.options as Record<string, string>,
      title: v.title,
      price: v.price,
      available: variantAvailable(v),
    })),
    quantityOffers: p.quantityOffers.map((o) => ({ id: o.id, quantity: o.quantity, price: o.price, label: o.label })),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    shortUrl: productShortUrl(p.shortCode),
  };
}
