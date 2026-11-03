/** JSON shapes returned by the API. Dates are ISO strings. */
import type { BillingPeriod, OrderStatus, PaymentStatus, PlanLimits, ProductStatus, PromoType, StoreRole, StoreStatus, SubscriptionStatus } from './domain';

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
  discount: number;
  promoCode: string | null;
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
  /** Whether the courier can sign in to the courier app with phone + PIN. */
  hasPin: boolean;
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
  /** Ad pixels to load on the storefront (only on plans that include them). */
  pixels: { metaPixelId: string | null; tiktokPixelId: string | null };
  /** Free plan: "Créé avec Myabéshop" badge in the footer. */
  showBadge: boolean;
  /** Whether the checkout shows a promo code field. */
  promoCodes: boolean;
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
  discount: number;
  total: number;
  customerName: string;
  city: string;
  address: string;
  items: { title: string; variantTitle: string | null; quantity: number; total: number }[];
  createdAt: string;
  timeline: { status: OrderStatus; at: string }[];
  store: { name: string; slug: string; whatsappPhone: string | null; phone: string | null; primaryColor: string; logoUrl: string | null; locale: string };
  pixels: { metaPixelId: string | null; tiktokPixelId: string | null };
}

// ---------- Billing ----------

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  limits: PlanLimits;
  active: boolean;
}

export interface PaymentDto {
  id: string;
  planCode: string;
  planName: string;
  period: BillingPeriod;
  months: number;
  amount: number;
  currency: string;
  gateway: string;
  reference: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface UsageDto {
  ordersThisMonth: number;
  products: number;
  members: number;
  couriers: number;
}

export interface BillingOverview {
  plan: PlanDto;
  subscription: { id: string; status: SubscriptionStatus; planCode: string; startsAt: string; endsAt: string; source: string; graceEndsAt: string | null } | null;
  /** Days left before the trial or paid period ends (negative during grace). */
  daysLeft: number | null;
  usage: UsageDto;
  plans: PlanDto[];
  payments: PaymentDto[];
  gateway: string;
  operators: { code: string; name: string }[];
  referral: { code: string; url: string; referred: number; rewarded: number };
  /** Orders received above the monthly quota, locked until the plan is upgraded. */
  lockedOrders: number;
}

export interface CheckoutResponse {
  payment: PaymentDto;
  /** Open this URL to pay (gateway page, or the local simulator in development). */
  checkoutUrl: string;
}

export interface InvoiceDto {
  number: string;
  issuedAt: string;
  payment: PaymentDto;
  seller: { name: string; address: string; email: string };
  buyer: { storeName: string; ownerName: string; phone: string | null; email: string | null; country: string };
  periodStart: string | null;
  periodEnd: string | null;
}

// ---------- Marketing ----------

export interface PromoCodeDto {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  createdAt: string;
}

export interface IntegrationsDto {
  pixels: { metaPixelId: string | null; tiktokPixelId: string | null };
  sheets: { webhookUrl: string | null; active: boolean; lastError: string | null; lastSyncAt: string | null };
  allowed: { pixels: boolean; sheets: boolean; promoCodes: boolean };
}

// ---------- Statistics (§8.3) ----------

export interface StatsBreakdownRow {
  key: string;
  label: string;
  orders: number;
  confirmed: number;
  delivered: number;
  refused: number;
  revenue: number;
  confirmationRate: number | null;
  deliveryRate: number | null;
}

export interface StatsReport {
  currency: string;
  from: string;
  to: string;
  totals: {
    orders: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    refused: number;
    cancelled: number;
    confirmationRate: number | null;
    deliveryRate: number | null;
    revenue: number;
    productCost: number;
    deliveryFees: number;
    discounts: number;
    courierCommissions: number;
    adSpend: number;
    profit: number;
    averageBasket: number | null;
  };
  daily: { day: string; orders: number; delivered: number; revenue: number }[];
  byProduct: StatsBreakdownRow[];
  byCity: StatsBreakdownRow[];
  byCourier: StatsBreakdownRow[];
  byAgent: StatsBreakdownRow[];
  bySource: StatsBreakdownRow[];
  adSpends: { id: string; day: string; channel: string; amount: number; note: string | null }[];
}

// ---------- Courier app ----------

export interface CourierDelivery {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  city: string;
  address: string;
  gps: { lat: number; lng: number } | null;
  total: number;
  currency: string;
  items: { title: string; variantTitle: string | null; quantity: number }[];
  postponedTo: string | null;
  note: string | null;
}

export interface CourierDeliveriesResponse {
  courier: { id: string; name: string; cashBalance: number; deliveredToday: number; commission: number } | null;
  store: { id: string; name: string; currency: string; phone: string | null } | null;
  orders: CourierDelivery[];
  serverTime: string;
}

export interface DeliverySyncResult {
  results: { id: string; ok: boolean; duplicate?: boolean; error?: string; message?: string }[];
  deliveries: CourierDeliveriesResponse;
}

// ---------- Super-admin ----------

export interface AdminOverview {
  stores: { total: number; active30d: number; new30d: number; suspended: number };
  orders: { today: number; last30d: number; delivered30d: number };
  revenue: { mrr: number; collected30d: number; currency: string };
  subscriptions: { trialing: number; paying: number; pastDue: number; churned30d: number };
  plans: { code: string; name: string; stores: number }[];
  signups: { day: string; count: number }[];
}

export interface AdminStoreRow {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: StoreStatus;
  planCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionEndsAt: string | null;
  owner: { id: string; name: string; phone: string | null; email: string | null } | null;
  orders30d: number;
  products: number;
  createdAt: string;
}

export interface AdminStoreDetail extends AdminStoreRow {
  url: string;
  suspendedReason: string | null;
  usage: UsageDto;
  payments: PaymentDto[];
  subscriptions: { id: string; planCode: string; status: SubscriptionStatus; startsAt: string; endsAt: string; source: string }[];
  audit: AuditEntry[];
}

export interface AuditEntry {
  id: string;
  storeId: string | null;
  actorId: string | null;
  actorName: string | null;
  action: string;
  target: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}
