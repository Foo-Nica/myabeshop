import { describe, expect, it } from 'vitest';
import {
  addMonths,
  planCharge,
  promoDiscount,
  canTransition,
  deliveryFeeFor,
  formatMoney,
  normalizePhone,
  priceForQuantity,
  roleHas,
  slugify,
} from './index';

describe('money', () => {
  it('formats FCFA without decimals', () => {
    expect(formatMoney(18000, 'XOF')).toBe('18 000 F CFA');
  });
});

describe('phone validation by country', () => {
  it('accepts an Ivorian mobile number and returns E.164', () => {
    expect(normalizePhone('07 07 07 07 07', 'CI')?.e164).toBe('+2250707070707');
  });
  it('accepts a Togolese mobile number', () => {
    expect(normalizePhone('90 12 34 56', 'TG')?.e164).toBe('+22890123456');
  });
  it('rejects garbage', () => {
    expect(normalizePhone('123', 'CI')).toBeNull();
  });
});

describe('quantity offers', () => {
  const offers = [{ quantity: 2, price: 18000 }, { quantity: 3, price: 25000 }];
  it('uses the unit price for 1', () => expect(priceForQuantity(10000, 1, offers)).toBe(10000));
  it('uses the 2-for offer', () => expect(priceForQuantity(10000, 2, offers)).toBe(18000));
  it('combines offers greedily', () => expect(priceForQuantity(10000, 4, offers)).toBe(35000));
});

describe('delivery fee', () => {
  it('is free above the threshold', () => {
    expect(deliveryFeeFor({ fee: 1500, freeAbove: 20000 }, 25000)).toBe(0);
    expect(deliveryFeeFor({ fee: 1500, freeAbove: 20000 }, 10000)).toBe(1500);
    expect(deliveryFeeFor({ fee: 1500 }, 10000)).toBe(1500);
  });
});

describe('domain rules', () => {
  it('slugifies French names', () => expect(slugify('Boutique Awa & Fils — Cocody')).toBe('boutique-awa-fils-cocody'));
  it('blocks invalid transitions', () => {
    expect(canTransition('NEW', 'CONFIRMED')).toBe(true);
    expect(canTransition('NEW', 'DELIVERED')).toBe(false);
  });
  it('agents cannot edit products', () => {
    expect(roleHas('AGENT', 'products.write')).toBe(false);
    expect(roleHas('MANAGER', 'billing.manage')).toBe(false);
    expect(roleHas('OWNER', 'billing.manage')).toBe(true);
  });
});

describe('promo codes', () => {
  it('computes percent, fixed and free-shipping discounts', () => {
    expect(promoDiscount({ type: 'PERCENT', value: 10 }, 18000, 1000)).toBe(1800);
    expect(promoDiscount({ type: 'FIXED', value: 2000 }, 1500, 1000)).toBe(1500);
    expect(promoDiscount({ type: 'FREE_SHIPPING', value: 0 }, 5000, 1500)).toBe(1500);
  });
  it('respects the minimum basket', () => {
    expect(promoDiscount({ type: 'PERCENT', value: 20, minSubtotal: 10000 }, 9000, 0)).toBe(0);
  });
});

describe('billing', () => {
  it('charges 10 months for an annual plan', () => {
    expect(planCharge(15000, 'ANNUAL')).toEqual({ amount: 150000, months: 12 });
    expect(planCharge(5000, 'MONTHLY')).toEqual({ amount: 5000, months: 1 });
  });
  it('adds months without overflowing short months', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-03T00:00:00Z'), 12).toISOString()).toBe('2027-11-03T00:00:00.000Z');
  });
});
