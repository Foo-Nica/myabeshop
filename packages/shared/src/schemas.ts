import { z } from 'zod';
import {
  AD_CHANNELS,
  BILLING_PERIODS,
  COUNTRY_CODES,
  PLAN_CODES,
  PROMO_TYPES,
  MAX_PRODUCT_IMAGES,
  MAX_VARIANT_OPTIONS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PRODUCT_STATUSES,
  STORE_CATEGORIES,
  STORE_ROLES,
  STORE_STATUSES,
  SUPPORTED_CURRENCIES,
} from './domain';

/** Integer amount in the currency's minor unit. */
const amount = z.number().int().min(0).max(1_000_000_000_000);
const id = z.string().min(1).max(64);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// ---------- Auth ----------

export const otpRequestSchema = z.object({
  /** Phone in any format (validated against `country`) or e-mail address. */
  target: z.string().trim().min(3).max(120),
  country: z.enum(COUNTRY_CODES).optional(),
  channel: z.enum(['sms', 'whatsapp', 'email']).default('sms'),
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  target: z.string().trim().min(3).max(120),
  country: z.enum(COUNTRY_CODES).optional(),
  code: z.string().trim().regex(/^\d{6}$/),
  name: z.string().trim().min(2).max(80).optional(),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

// ---------- Stores ----------

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Lettres minuscules, chiffres et tirets uniquement');

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema.optional(),
  country: z.enum(COUNTRY_CODES),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  category: z.enum(STORE_CATEGORIES).default('other'),
  logoUrl: z.string().url().max(500).optional(),
  whatsappPhone: z.string().trim().max(30).optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
  /** Referral code of the merchant who invited this one (§9.3). */
  referralCode: z.string().trim().toUpperCase().max(20).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().max(2000).nullable(),
    logoUrl: z.string().url().max(500).nullable(),
    bannerUrl: z.string().url().max(500).nullable(),
    primaryColor: hexColor,
    theme: z.enum(['classic', 'bold', 'minimal']),
    category: z.enum(STORE_CATEGORIES),
    phone: z.string().trim().max(30).nullable(),
    whatsappPhone: z.string().trim().max(30).nullable(),
    address: z.string().max(300).nullable(),
    openingHours: z.string().max(300).nullable(),
    social: z
      .object({
        facebook: z.string().url().max(300).optional(),
        instagram: z.string().url().max(300).optional(),
        tiktok: z.string().url().max(300).optional(),
      })
      .partial(),
    deliveryPolicy: z.string().max(5000).nullable(),
    returnPolicy: z.string().max(5000).nullable(),
    locale: z.enum(['fr', 'en']),
    closed: z.boolean(),
    closedMessage: z.string().max(300).nullable(),
    maxOrdersPerPhonePerDay: z.number().int().min(1).max(100),
    blockUnservedZones: z.boolean(),
  })
  .partial();
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

// ---------- Products ----------

export const variantInputSchema = z.object({
  id: id.optional(),
  /** Values keyed by option name, e.g. { Taille: "M", Couleur: "Noir" }. */
  options: z.record(z.string().min(1).max(40), z.string().min(1).max(60)),
  price: amount.nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  sku: z.string().max(60).nullable().optional(),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const quantityOfferInputSchema = z.object({
  quantity: z.number().int().min(2).max(100),
  price: amount,
  label: z.string().max(60).nullable().optional(),
});
export type QuantityOfferInput = z.infer<typeof quantityOfferInputSchema>;

const productBase = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().max(20_000).default(''),
  price: amount,
  compareAtPrice: amount.nullable().optional(),
  cost: amount.nullable().optional(),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  images: z.array(z.string().url().max(500)).max(MAX_PRODUCT_IMAGES).default([]),
  videoUrl: z.string().url().max(500).nullable().optional(),
  /** Option names, e.g. ["Taille", "Couleur"]. */
  options: z.array(z.string().trim().min(1).max(40)).max(MAX_VARIANT_OPTIONS).default([]),
  variants: z.array(variantInputSchema).max(100).default([]),
  quantityOffers: z.array(quantityOfferInputSchema).max(5).default([]),
  trackStock: z.boolean().default(false),
  stock: z.number().int().min(0).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
});

export const createProductSchema = productBase.superRefine((p, ctx) => {
  for (const [i, v] of p.variants.entries()) {
    const keys = Object.keys(v.options);
    if (keys.some((k) => !p.options.includes(k))) {
      ctx.addIssue({ code: 'custom', path: ['variants', i, 'options'], message: 'Option inconnue' });
    }
  }
  if (p.compareAtPrice != null && p.compareAtPrice <= p.price) {
    ctx.addIssue({ code: 'custom', path: ['compareAtPrice'], message: 'Le prix barré doit être supérieur au prix' });
  }
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productBase.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ---------- Delivery zones ----------

export const zoneSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  fee: amount,
  freeAbove: amount.nullable().optional(),
  delay: z.string().trim().max(60).nullable().optional(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});
export type ZoneInput = z.infer<typeof zoneSchema>;
export const updateZoneSchema = zoneSchema.partial();

// ---------- Orders ----------

export const publicOrderSchema = z.object({
  productId: id,
  variantId: id.nullable().optional(),
  quantity: z.number().int().min(1).max(50),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(30),
  /** A delivery zone id, or "OTHER" for a city outside the merchant's zones. */
  zoneId: id,
  /** Free-text city, used only with zoneId "OTHER". */
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().min(2).max(300),
  gps: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  utm: z.record(z.string().max(40), z.string().max(200)).optional(),
  promoCode: z.string().trim().toUpperCase().max(30).optional(),
});
export type PublicOrderInput = z.infer<typeof publicOrderSchema>;

export const manualOrderSchema = publicOrderSchema.extend({
  source: z.enum(ORDER_SOURCES).default('manual'),
});
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

export const orderStatusChangeSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
  /** Required for REFUSED. */
  reason: z.string().trim().max(200).optional(),
  /** Required for POSTPONED (ISO date). */
  postponedTo: z.string().datetime().optional(),
});
export type OrderStatusChangeInput = z.infer<typeof orderStatusChangeSchema>;

export const orderUpdateSchema = z
  .object({
    customerName: z.string().trim().min(2).max(80),
    customerPhone: z.string().trim().min(6).max(30),
    zoneId: id,
    address: z.string().trim().min(2).max(300),
    note: z.string().trim().max(500).nullable(),
    items: z
      .array(z.object({ id: id, quantity: z.number().int().min(1).max(50), variantId: id.nullable().optional() }))
      .min(1),
  })
  .partial();
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

export const orderAssignSchema = z.object({
  courierId: id.nullable().optional(),
  agentId: id.nullable().optional(),
});
export type OrderAssignInput = z.infer<typeof orderAssignSchema>;

export const orderNoteSchema = z.object({ note: z.string().trim().min(1).max(1000) });

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
  zoneId: id.optional(),
  courierId: id.optional(),
  productId: id.optional(),
  source: z.enum(ORDER_SOURCES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const bulkOrderActionSchema = z.object({
  orderIds: z.array(id).min(1).max(200),
  action: z.enum(['confirm', 'assign']),
  courierId: id.optional(),
});
export type BulkOrderActionInput = z.infer<typeof bulkOrderActionSchema>;

// ---------- Team & couriers ----------

export const courierSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(30),
  commission: amount.default(0),
  active: z.boolean().default(true),
});
export type CourierInput = z.infer<typeof courierSchema>;
export const updateCourierSchema = courierSchema.partial();

export const inviteMemberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  target: z.string().trim().min(3).max(120),
  role: z.enum(STORE_ROLES).exclude(['OWNER']),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const remittanceSchema = z.object({
  amount: amount.refine((n) => n > 0),
  method: z.enum(['cash', 'mobile_money', 'bank']),
  note: z.string().max(300).optional(),
});
export type RemittanceInput = z.infer<typeof remittanceSchema>;

export const courierPinSchema = z.object({
  /** Leave empty to let the server generate a 4-digit PIN. */
  pin: z.string().regex(/^\d{4,6}$/, 'Le code PIN doit avoir 4 à 6 chiffres').optional(),
});
export type CourierPinInput = z.infer<typeof courierPinSchema>;

export const courierLoginSchema = z.object({
  phone: z.string().trim().min(6).max(30),
  country: z.enum(COUNTRY_CODES).default('CI'),
  pin: z.string().regex(/^\d{4,6}$/),
});
export type CourierLoginInput = z.infer<typeof courierLoginSchema>;

/** Actions queued by the offline courier app and replayed when the network comes back. */
export const deliverySyncSchema = z.object({
  actions: z
    .array(
      z.object({
        /** Generated on the phone (UUID): replaying the same action twice has no effect. */
        id: z.string().min(8).max(64),
        orderId: id,
        status: z.enum(['DELIVERED', 'REFUSED', 'POSTPONED']),
        reason: z.string().trim().max(200).optional(),
        postponedTo: z.string().datetime().optional(),
        note: z.string().trim().max(500).optional(),
        /** When the courier tapped the button, possibly offline. */
        at: z.string().datetime(),
      }),
    )
    .max(200),
});
export type DeliverySyncInput = z.infer<typeof deliverySyncSchema>;

// ---------- Billing ----------

export const checkoutSchema = z.object({
  planCode: z.enum(PLAN_CODES).exclude(['free']),
  period: z.enum(BILLING_PERIODS).default('MONTHLY'),
  /** Mobile Money number of the payer, validated against the store's country. */
  phone: z.string().trim().min(6).max(30),
  operator: z.string().trim().max(30).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------- Marketing ----------

export const promoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(30)
      .regex(/^[A-Z0-9_-]+$/, 'Lettres, chiffres, tirets uniquement'),
    type: z.enum(PROMO_TYPES),
    value: z.number().int().min(0).max(1_000_000_000).default(0),
    minSubtotal: amount.nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    active: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.type === 'PERCENT' && (p.value < 1 || p.value > 100)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Pourcentage entre 1 et 100' });
    }
    if (p.type === 'FIXED' && p.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Montant requis' });
  });
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;
export const updatePromoCodeSchema = z.object({ active: z.boolean(), endsAt: z.string().datetime().nullable(), usageLimit: z.number().int().min(1).nullable() }).partial();

export const promoValidateSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(30),
  subtotal: amount,
  deliveryFee: amount.default(0),
});

export const pixelsConfigSchema = z.object({
  metaPixelId: z.string().trim().regex(/^\d{6,20}$/, 'Identifiant Meta : chiffres uniquement').nullable().optional(),
  tiktokPixelId: z.string().trim().regex(/^[A-Z0-9]{10,30}$/i, 'Identifiant TikTok invalide').nullable().optional(),
});
export type PixelsConfig = z.infer<typeof pixelsConfigSchema>;

export const sheetsConfigSchema = z.object({
  /** URL of the merchant's Google Apps Script web app (script.google.com/macros/s/.../exec). */
  webhookUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https:\/\/script\.google(usercontent)?\.com\//.test(u), 'Collez l’URL de l’application Apps Script (script.google.com)'),
  active: z.boolean().default(true),
});
export type SheetsConfig = z.infer<typeof sheetsConfigSchema>;

export const adSpendSchema = z.object({
  day: z.string().date(),
  channel: z.enum(AD_CHANNELS),
  amount: amount.refine((n) => n > 0, 'Montant requis'),
  note: z.string().trim().max(200).optional(),
});
export type AdSpendInput = z.infer<typeof adSpendSchema>;

export const statsReportQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type StatsReportQuery = z.infer<typeof statsReportQuerySchema>;

// ---------- Super-admin ----------

export const adminStoreListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(STORE_STATUSES).optional(),
  plan: z.enum(PLAN_CODES).optional(),
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type AdminStoreListQuery = z.infer<typeof adminStoreListQuerySchema>;

export const adminSuspendSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const adminGrantPlanSchema = z.object({ planCode: z.enum(PLAN_CODES), days: z.number().int().min(1).max(730), note: z.string().max(300).optional() });
export type AdminGrantPlanInput = z.infer<typeof adminGrantPlanSchema>;
export const adminPlanUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(40),
    price: amount,
    active: z.boolean(),
    limits: z.object({
      ordersPerMonth: z.number().int().min(1).nullable(),
      products: z.number().int().min(1).nullable(),
      members: z.number().int().min(1).nullable(),
      customDomain: z.boolean(),
      couriers: z.boolean(),
      pixels: z.boolean(),
      promoCodes: z.boolean(),
      agents: z.boolean(),
      sheets: z.boolean(),
      showPlatformBadge: z.boolean(),
    }).partial(),
  })
  .partial();
export type AdminPlanUpdateInput = z.infer<typeof adminPlanUpdateSchema>;
