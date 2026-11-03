import { CURRENCY_DECIMALS } from './domain';

/**
 * Amounts are stored as integers in the currency's minor unit (cahier des charges §12).
 * For XOF/XAF the minor unit is the franc itself.
 */
export function formatMoney(amount: number, currency: string, locale = 'fr'): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const value = amount / 10 ** decimals;
  if (currency === 'XOF' || currency === 'XAF') {
    const n = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 0 })
      .format(value)
      .replace(/ | /g, ' ');
    return `${n} F CFA`;
  }
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Convert a user-entered major amount ("10 000", "12.5") to minor units. */
export function toMinorUnits(major: number, currency: string): number {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return Math.round(major * 10 ** decimals);
}

export function fromMinorUnits(minor: number, currency: string): number {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return minor / 10 ** decimals;
}

/** "Boutique Awa & Fils" -> "boutique-awa-fils" */
export function slugify(input: string, maxLength = 48): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** Subdomains that cannot be claimed by a store. */
export const RESERVED_SLUGS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'dashboard',
  'static',
  'assets',
  'cdn',
  'mail',
  'help',
  'support',
  'status',
  'blog',
  'docs',
  'p',
  's',
  't',
  'login',
  'signup',
  'myabeshop',
  'livreur',
  'paiement',
  'billing',
  'conditions',
  'confidentialite',
]);

const SHORT_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Short, unambiguous code for product links (plateforme.com/p/abc123). */
export function shortCode(length = 7, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(random() * SHORT_CODE_ALPHABET.length)];
  }
  return out;
}

/** wa.me link with an optional pre-filled message. Phone must be E.164 or digits. */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export interface OrderRecapInput {
  storeName: string;
  orderNumber: number;
  customerName: string;
  items: { title: string; variantTitle?: string | null; quantity: number }[];
  total: number;
  currency: string;
  city: string;
  address: string;
  locale?: 'fr' | 'en';
}

/** Pre-filled confirmation message sent by the merchant on WhatsApp (cahier des charges §6.2). */
export function orderRecapMessage(o: OrderRecapInput): string {
  const lines = o.items.map(
    (i) => `• ${i.quantity} × ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`,
  );
  const total = formatMoney(o.total, o.currency, o.locale);
  if (o.locale === 'en') {
    return [
      `Hello ${o.customerName}, this is ${o.storeName}.`,
      `We received your order #${o.orderNumber}:`,
      ...lines,
      `Total: ${total} (cash on delivery)`,
      `Delivery: ${o.city}, ${o.address}`,
      'Can you confirm the order? Reply YES to confirm.',
    ].join('\n');
  }
  return [
    `Bonjour ${o.customerName}, ici ${o.storeName}.`,
    `Nous avons bien reçu votre commande n°${o.orderNumber} :`,
    ...lines,
    `Total : ${total} (paiement à la livraison)`,
    `Livraison : ${o.city}, ${o.address}`,
    'Confirmez-vous la commande ? Répondez OUI pour confirmer.',
  ].join('\n');
}

/**
 * Price of a line given the product's quantity offers ("1 pour 10 000 F, 2 pour 18 000 F").
 * Uses the largest offer that fits, repeatedly, then the unit price for the remainder.
 */
export function priceForQuantity(
  unitPrice: number,
  quantity: number,
  offers: readonly { quantity: number; price: number }[] = [],
): number {
  const sorted = [...offers].filter((o) => o.quantity > 0).sort((a, b) => b.quantity - a.quantity);
  let remaining = quantity;
  let total = 0;
  for (const offer of sorted) {
    if (offer.quantity === 1) continue;
    const times = Math.floor(remaining / offer.quantity);
    if (times > 0) {
      total += times * offer.price;
      remaining -= times * offer.quantity;
    }
  }
  total += remaining * unitPrice;
  return total;
}

/** Delivery fee for a zone, honouring the free-delivery threshold. */
export function deliveryFeeFor(
  zone: { fee: number; freeAbove?: number | null },
  subtotal: number,
): number {
  if (zone.freeAbove != null && zone.freeAbove > 0 && subtotal >= zone.freeAbove) return 0;
  return zone.fee;
}

// ---------- Promo codes & billing ----------

export interface PromoLike {
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: number;
  minSubtotal?: number | null;
}

/**
 * Discount granted by a promo code. Never more than the subtotal (or the delivery fee for
 * free shipping); 0 when the minimum basket is not reached.
 */
export function promoDiscount(promo: PromoLike, subtotal: number, deliveryFee: number): number {
  if (promo.minSubtotal != null && subtotal < promo.minSubtotal) return 0;
  switch (promo.type) {
    case 'PERCENT':
      return Math.min(subtotal, Math.round((subtotal * Math.min(Math.max(promo.value, 0), 100)) / 100));
    case 'FIXED':
      return Math.min(subtotal, Math.max(promo.value, 0));
    case 'FREE_SHIPPING':
      return Math.max(deliveryFee, 0);
  }
}

/** Price charged for a plan and billing period, plus the months it covers. */
export function planCharge(monthlyPrice: number, period: 'MONTHLY' | 'ANNUAL'): { amount: number; months: number } {
  return period === 'ANNUAL' ? { amount: monthlyPrice * 10, months: 12 } : { amount: monthlyPrice, months: 1 };
}

/** Adds calendar months, clamping to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Ratio as a whole percentage, or null when the denominator is 0. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
