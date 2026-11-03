import type { Store } from '@prisma/client';
import { getCountry, type PublicStoreDto, type StoreDto, type ZoneDto } from '@myabeshop/shared';

export function toStoreDto(s: Store): StoreDto {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    customDomain: s.customDomain,
    country: s.country,
    currency: s.currency,
    locale: s.locale,
    category: s.category,
    description: s.description,
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    primaryColor: s.primaryColor,
    theme: s.theme,
    phone: s.phone,
    whatsappPhone: s.whatsappPhone,
    address: s.address,
    openingHours: s.openingHours,
    social: (s.social ?? {}) as Record<string, string>,
    deliveryPolicy: s.deliveryPolicy,
    returnPolicy: s.returnPolicy,
    status: s.status,
    closedMessage: s.closedMessage,
    maxOrdersPerPhonePerDay: s.maxOrdersPerPhonePerDay,
    blockUnservedZones: s.blockUnservedZones,
    createdAt: s.createdAt.toISOString(),
  };
}

export interface StorefrontExtras {
  pixels: PublicStoreDto['pixels'];
  showBadge: boolean;
  promoCodes: boolean;
}

export function toPublicStoreDto(
  s: Store,
  zones: ZoneDto[],
  extras: StorefrontExtras = { pixels: { metaPixelId: null, tiktokPixelId: null }, showBadge: false, promoCodes: false },
): PublicStoreDto {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    country: s.country,
    currency: s.currency,
    locale: s.locale,
    description: s.description,
    logoUrl: s.logoUrl,
    bannerUrl: s.bannerUrl,
    primaryColor: s.primaryColor,
    theme: s.theme,
    phone: s.phone,
    whatsappPhone: s.whatsappPhone,
    address: s.address,
    openingHours: s.openingHours,
    social: (s.social ?? {}) as Record<string, string>,
    deliveryPolicy: s.deliveryPolicy,
    returnPolicy: s.returnPolicy,
    closed: s.status !== 'ACTIVE',
    closedMessage: s.closedMessage,
    dialCode: getCountry(s.country)?.dialCode ?? '',
    zones: zones
      .filter((z) => z.active)
      .map(({ id, name, city, fee, freeAbove, delay }) => ({ id, name, city, fee, freeAbove, delay })),
    ...extras,
  };
}
