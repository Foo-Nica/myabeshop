/** JSON shapes returned by the API. Dates are ISO strings. */
import type { OrderStatus, ProductStatus, StoreRole, StoreStatus } from './domain';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MeResponse {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: string;
  isSuperAdmin: boolean;
  memberships: { storeId: string; role: StoreRole; store: { id: string; name: string; slug: string; logoUrl: string | null } }[];
}

export interface AuthResponse extends AuthTokens {
  user: MeResponse;
}

export interface StoreDto {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  country: string;
  currency: string;
  locale: string;
  category: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  theme: string;
  phone: string | null;
  whatsappPhone: string | null;
  address: string | null;
  openingHours: string | null;
  social: Record<string, string>;
  deliveryPolicy: string | null;
  returnPolicy: string | null;
  status: StoreStatus;
  closedMessage: string | null;
  maxOrdersPerPhonePerDay: number;
  blockUnservedZones: boolean;
  createdAt: string;
}

export interface StoreWithRole extends StoreDto {
  role: StoreRole;
  url: string;
}

export interface VariantDto {
  id: string;
  options: Record<string, string>;
  title: string;
  price: number | null;
  stock: number | null;
  sku: string | null;
}

export interface QuantityOfferDto {
  id: string;
  quantity: number;
  price: number;
  label: string | null;
}

export interface ProductDto {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  shortCode: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  cost: number | null;
  status: ProductStatus;
  images: string[];
  videoUrl: string | null;
  options: string[];
  trackStock: boolean;
  stock: number | null;
  lowStockThreshold: number | null;
  variants: VariantDto[];
  quantityOffers: QuantityOfferDto[];
  createdAt: string;
  updatedAt: string;
  shortUrl?: string;
}

export interface ZoneDto {
  id: string;
  name: string;
  city: string;
  fee: number;
  freeAbove: number | null;
  delay: string | null;
  active: boolean;
  position: number;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OrderEventDto {
  id: string;
  type: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  userName: string | null;
  note: string | null;
  createdAt: string;
}

export interface OrderSummaryDto {
  id: string;
  number: number;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  customerPhone: string;
  city: string;
  source: string | null;
  flags: string[];
  callAttempts: number;
  courierId: string | null;
  courierName: string | null;
  agentId: string | null;
  itemsSummary: string;
  createdAt: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  trackingToken: string;
  zoneId: string | null;
  zoneName: string | null;
  address: string;
  gps: { lat: number; lng: number } | null;
  note: string | null;
  utm: Record<string, string> | null;
  postponedTo: string | null;
  refusalReason: string | null;
  items: OrderItemDto[];
  events: OrderEventDto[];
  customer: { id: string; deliveredCount: number; refusedCount: number; blacklisted: boolean; score: number | null };
  whatsappUrl: string;
  callUrl: string;
  trackingUrl: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OrderCounts {
  byStatus: Partial<Record<OrderStatus, number>>;
  today: number;
}

export interface CourierDto {
  id: string;
  name: string;
  phone: string;
  commission: number;
  cashBalance: number;
  active: boolean;
  activeDeliveries: number;
}

export interface DashboardStats {
  currency: string;
  ordersToday: number;
  ordersPeriod: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
  revenueCollected: number;
  cashPending: number;
  byStatus: Partial<Record<OrderStatus, number>>;
}

/** Public storefront payloads (no internal fields such as cost). */
export interface PublicStoreDto {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  locale: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  theme: string;
  phone: string | null;
  whatsappPhone: string | null;
  address: string | null;
  openingHours: string | null;
  social: Record<string, string>;
  deliveryPolicy: string | null;
  returnPolicy: string | null;
  closed: boolean;
  closedMessage: string | null;
  dialCode: string;
  zones: Omit<ZoneDto, 'active' | 'position'>[];
}

export type PublicProductDto = Omit<ProductDto, 'cost' | 'storeId' | 'trackStock' | 'lowStockThreshold' | 'stock' | 'variants'> & {
  available: boolean;
  variants: (Omit<VariantDto, 'stock' | 'sku'> & { available: boolean })[];
};

export interface PublicOrderCreated {
  orderId: string;
  number: number;
  trackingToken: string;
  total: number;
  currency: string;
}

export interface PublicTrackingDto {
  number: number;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  customerName: string;
  city: string;
  address: string;
  items: { title: string; variantTitle: string | null; quantity: number; total: number }[];
  createdAt: string;
  timeline: { status: OrderStatus; at: string }[];
  store: { name: string; slug: string; whatsappPhone: string | null; phone: string | null; primaryColor: string; logoUrl: string | null; locale: string };
}
