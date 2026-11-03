/**
 * Domain constants shared by the API and the web apps.
 * Keep this file free of runtime dependencies so it stays cheap to import in the browser.
 */

export const STORE_ROLES = ['OWNER', 'MANAGER', 'AGENT', 'COURIER'] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

/**
 * Permissions are checked server-side on every request (cahier des charges §3).
 * The UI uses the same table only to hide actions the user cannot perform.
 */
export const PERMISSIONS = [
  'store.read',
  'store.update',
  'store.delete',
  'billing.manage',
  'team.manage',
  'products.read',
  'products.write',
  'zones.read',
  'zones.write',
  'orders.read.all',
  'orders.read.assigned',
  'orders.write',
  'orders.confirm',
  'orders.assign',
  'couriers.read',
  'couriers.write',
  'stats.read',
  'deliveries.read.own',
  'deliveries.update.own',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<StoreRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  MANAGER: [
    'store.read',
    'store.update',
    'products.read',
    'products.write',
    'zones.read',
    'zones.write',
    'orders.read.all',
    'orders.write',
    'orders.confirm',
    'orders.assign',
    'couriers.read',
    'couriers.write',
    'stats.read',
  ],
  AGENT: ['store.read', 'zones.read', 'orders.read.assigned', 'orders.confirm'],
  COURIER: ['store.read', 'deliveries.read.own', 'deliveries.update.own'],
};

export function roleHas(role: StoreRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ORDER_STATUSES = [
  'NEW',
  'UNREACHABLE',
  'CONFIRMED',
  'CANCELLED',
  'SHIPPED',
  'POSTPONED',
  'DELIVERED',
  'REFUSED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions. Anything not listed is rejected by the API. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['CONFIRMED', 'UNREACHABLE', 'CANCELLED'],
  UNREACHABLE: ['CONFIRMED', 'UNREACHABLE', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED', 'NEW'],
  SHIPPED: ['DELIVERED', 'REFUSED', 'POSTPONED', 'CONFIRMED'],
  POSTPONED: ['SHIPPED', 'DELIVERED', 'REFUSED', 'CANCELLED'],
  DELIVERED: [],
  REFUSED: ['RETURNED'],
  CANCELLED: ['NEW'],
  RETURNED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Statuses a courier may set from the delivery app. */
export const COURIER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'REFUSED', 'POSTPONED'];
/** Statuses a confirmation agent may set. */
export const AGENT_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'UNREACHABLE', 'CANCELLED'];

/** Statuses that change before shipping and therefore still allow editing the order lines. */
export const EDITABLE_ORDER_STATUSES: readonly OrderStatus[] = ['NEW', 'UNREACHABLE', 'CONFIRMED'];

export const PRODUCT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const STORE_STATUSES = ['ACTIVE', 'CLOSED', 'SUSPENDED'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_CATEGORIES = [
  'fashion',
  'beauty',
  'electronics',
  'home',
  'food',
  'health',
  'kids',
  'other',
] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const ORDER_SOURCES = ['facebook', 'instagram', 'tiktok', 'whatsapp', 'google', 'direct', 'manual', 'other'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export interface CountryInfo {
  code: string;
  name: { fr: string; en: string };
  dialCode: string;
  currency: string;
}

/** Pilot countries: the FCFA zones first (cahier des charges §2). */
export const COUNTRIES: readonly CountryInfo[] = [
  { code: 'CI', name: { fr: "Côte d'Ivoire", en: "Côte d'Ivoire" }, dialCode: '225', currency: 'XOF' },
  { code: 'SN', name: { fr: 'Sénégal', en: 'Senegal' }, dialCode: '221', currency: 'XOF' },
  { code: 'TG', name: { fr: 'Togo', en: 'Togo' }, dialCode: '228', currency: 'XOF' },
  { code: 'BJ', name: { fr: 'Bénin', en: 'Benin' }, dialCode: '229', currency: 'XOF' },
  { code: 'BF', name: { fr: 'Burkina Faso', en: 'Burkina Faso' }, dialCode: '226', currency: 'XOF' },
  { code: 'ML', name: { fr: 'Mali', en: 'Mali' }, dialCode: '223', currency: 'XOF' },
  { code: 'NE', name: { fr: 'Niger', en: 'Niger' }, dialCode: '227', currency: 'XOF' },
  { code: 'GW', name: { fr: 'Guinée-Bissau', en: 'Guinea-Bissau' }, dialCode: '245', currency: 'XOF' },
  { code: 'CM', name: { fr: 'Cameroun', en: 'Cameroon' }, dialCode: '237', currency: 'XAF' },
  { code: 'GA', name: { fr: 'Gabon', en: 'Gabon' }, dialCode: '241', currency: 'XAF' },
  { code: 'CG', name: { fr: 'Congo', en: 'Congo' }, dialCode: '242', currency: 'XAF' },
  { code: 'TD', name: { fr: 'Tchad', en: 'Chad' }, dialCode: '235', currency: 'XAF' },
  { code: 'CF', name: { fr: 'Centrafrique', en: 'Central African Republic' }, dialCode: '236', currency: 'XAF' },
  { code: 'GQ', name: { fr: 'Guinée équatoriale', en: 'Equatorial Guinea' }, dialCode: '240', currency: 'XAF' },
];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]];

export function getCountry(code: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

/** ISO 4217 minor-unit exponents. XOF and XAF have no minor unit. */
export const CURRENCY_DECIMALS: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  NGN: 2,
  GHS: 2,
  MAD: 2,
  KES: 2,
  EUR: 2,
  USD: 2,
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_DECIMALS) as [string, ...string[]];

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_VARIANT_OPTIONS = 3;
