/**
 * Phase « Paiements OK » (cahier des charges §13): Mobile Money subscriptions and plan limits,
 * offline courier app with PIN, promo codes, statistics, super-admin back-office.
 */
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, createTestApp, nextPhone, setupStore, signInWithPhone } from './helpers';
import { PrismaService } from '../src/common/prisma.service';
import { BillingService } from '../src/billing/billing.service';

let app: INestApplication;
let prisma: PrismaService;
let billing: BillingService;
const DAY = 86_400_000;

beforeAll(async () => {
  ({ app } = await createTestApp());
  prisma = app.get(PrismaService);
  billing = app.get(BillingService);
});

afterAll(async () => {
  await app?.close();
});

const order = (s: Awaited<ReturnType<typeof setupStore>>, extra: Record<string, unknown> = {}) =>
  api(app).post(`/public/stores/${s.store.slug}/orders`, {
    productId: s.product.id,
    quantity: 1,
    customerName: 'Cliente Test',
    customerPhone: nextPhone(),
    zoneId: s.zones[0].id,
    address: 'Derrière la pharmacie',
    ...extra,
  });

async function downgradeToFree(storeId: string) {
  await prisma.subscription.updateMany({ where: { storeId }, data: { endsAt: new Date(Date.now() - 10 * DAY), status: 'PAST_DUE' } });
  await billing.runLifecycle();
}

describe('Abonnements Mobile Money', () => {
  it('starts with a 14-day Pro trial and lists the plans', async () => {
    const s = await setupStore(app, 'Essai Pro');
    const overview = (await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body;
    expect(overview.plan.code).toBe('pro');
    expect(overview.subscription).toMatchObject({ status: 'TRIALING', source: 'trial' });
    expect(overview.daysLeft).toBeGreaterThanOrEqual(13);
    expect(overview.plans.map((p: { code: string }) => p.code)).toEqual(['free', 'starter', 'pro', 'business']);
    expect(overview.referral.code).toMatch(/^[A-Z0-9]{6,}$/);
    const plans = (await api(app).get('/plans').expect(200)).body;
    expect(plans).toHaveLength(4);
  });

  it('pays by Mobile Money (simulator), activates the plan once and issues an invoice', async () => {
    const s = await setupStore(app, 'Paie Starter');
    const checkout = (await s.a.post(`/stores/${s.store.id}/billing/checkout`, { planCode: 'starter', period: 'ANNUAL', phone: nextPhone() }).expect(201)).body;
    expect(checkout.payment).toMatchObject({ status: 'PENDING', amount: 50000, months: 12, gateway: 'simulator' });
    expect(checkout.checkoutUrl).toContain('/paiement/simulateur?ref=');

    const ref = checkout.payment.reference;
    await api(app).post(`/billing/simulator/${ref}`, { outcome: 'SUCCEEDED' }).expect(200);
    // A second notification must not extend the subscription twice.
    await s.a.post(`/stores/${s.store.id}/billing/payments/${checkout.payment.id}/refresh`).expect(200);

    const overview = (await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body;
    expect(overview.plan.code).toBe('starter');
    expect(overview.subscription).toMatchObject({ status: 'ACTIVE', planCode: 'starter', source: 'payment' });
    expect(overview.daysLeft).toBeGreaterThan(360);
    expect(await prisma.subscription.count({ where: { storeId: s.store.id, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.subscription.count({ where: { storeId: s.store.id, status: 'TRIALING' } })).toBe(0);

    const paid = overview.payments[0];
    expect(paid.status).toBe('SUCCEEDED');
    expect(paid.invoiceNumber).toMatch(/^MYA-\d{4}-\d{5}$/);
    const invoice = (await s.a.get(`/stores/${s.store.id}/billing/payments/${paid.id}/invoice`).expect(200)).body;
    expect(invoice.buyer.storeName).toBe('Paie Starter');
    expect(invoice.payment.amount).toBe(50000);
  });

  it('records a declined payment without changing the plan', async () => {
    const s = await setupStore(app, 'Paie Refusée');
    const checkout = (await s.a.post(`/stores/${s.store.id}/billing/checkout`, { planCode: 'business', phone: nextPhone() }).expect(201)).body;
    await api(app).post(`/billing/simulator/${checkout.payment.reference}`, { outcome: 'FAILED' }).expect(200);
    const overview = (await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body;
    expect(overview.payments[0].status).toBe('FAILED');
    expect(overview.plan.code).toBe('pro');
  });

  it('renews from the current end date', async () => {
    const s = await setupStore(app, 'Renouvelle');
    for (let i = 0; i < 2; i++) {
      const c = (await s.a.post(`/stores/${s.store.id}/billing/checkout`, { planCode: 'pro', phone: nextPhone() }).expect(201)).body;
      await api(app).post(`/billing/simulator/${c.payment.reference}`, { outcome: 'SUCCEEDED' }).expect(200);
    }
    const subs = await prisma.subscription.findMany({ where: { storeId: s.store.id, status: 'ACTIVE' }, orderBy: { startsAt: 'asc' } });
    expect(subs).toHaveLength(2);
    expect(subs[1]!.startsAt.getTime()).toBe(subs[0]!.endsAt.getTime());
  });

  it('keeps the plan 7 days after expiry, then falls back to Free without deleting data', async () => {
    const s = await setupStore(app, 'Expiration');
    const sub = await prisma.subscription.findFirstOrThrow({ where: { storeId: s.store.id } });
    await prisma.subscription.update({ where: { id: sub.id }, data: { endsAt: new Date(Date.now() - 2 * DAY) } });
    await billing.runLifecycle();
    let overview = (await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body;
    expect(overview.subscription.status).toBe('PAST_DUE');
    expect(overview.subscription.graceEndsAt).toBeTruthy();
    expect(overview.plan.code).toBe('pro');

    await prisma.subscription.update({ where: { id: sub.id }, data: { endsAt: new Date(Date.now() - 8 * DAY) } });
    await billing.runLifecycle();
    overview = (await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body;
    expect(overview.plan.code).toBe('free');
    expect(overview.subscription).toBeNull();
    await s.a.get(`/stores/${s.store.id}/products/${s.product.id}`).expect(200);
  });

  it('only the owner manages billing', async () => {
    const s = await setupStore(app, 'Droits facturation');
    const phone = nextPhone();
    await s.a.post(`/stores/${s.store.id}/members`, { name: 'Gérant', target: phone, role: 'MANAGER' }).expect(201);
    const manager = await signInWithPhone(app, phone);
    await api(app, manager.accessToken).get(`/stores/${s.store.id}/billing`).expect(403);
  });

  it('rewards the referrer with one month when the referred store pays', async () => {
    const referrer = await setupStore(app, 'Parrain');
    const code = (await referrer.a.get(`/stores/${referrer.store.id}/billing`).expect(200)).body.referral.code;
    const owner = await signInWithPhone(app, nextPhone());
    const fa = api(app, owner.accessToken);
    const filleul = (await fa.post('/stores', { name: 'Filleul', country: 'CI', referralCode: code }).expect(201)).body;
    const c = (await fa.post(`/stores/${filleul.id}/billing/checkout`, { planCode: 'starter', phone: nextPhone() }).expect(201)).body;
    await api(app).post(`/billing/simulator/${c.payment.reference}`, { outcome: 'SUCCEEDED' }).expect(200);
    const overview = (await referrer.a.get(`/stores/${referrer.store.id}/billing`).expect(200)).body;
    expect(overview.referral).toMatchObject({ referred: 1, rewarded: 1 });
  });
});

describe('Limites des plans', () => {
  it('Free: 10 products, no couriers, no promo codes, badge shown', async () => {
    const s = await setupStore(app, 'Plan Gratuit');
    await downgradeToFree(s.store.id);
    for (let i = 0; i < 9; i++) await s.a.post(`/stores/${s.store.id}/products`, { title: `Produit ${i}`, price: 1000 }).expect(201);
    const blocked = await s.a.post(`/stores/${s.store.id}/products`, { title: 'Produit 11', price: 1000 }).expect(402);
    expect(blocked.body.code).toBe('PLAN_LIMIT');
    expect((await s.a.post(`/stores/${s.store.id}/couriers`, { name: 'Livreur', phone: nextPhone() }).expect(402)).body.code).toBe('PLAN_FEATURE');
    await s.a.post(`/stores/${s.store.id}/promo-codes`, { code: 'NOEL', type: 'PERCENT', value: 10 }).expect(402);
    await s.a.post(`/stores/${s.store.id}/members`, { name: 'Agent', target: nextPhone(), role: 'AGENT' }).expect(402);
    const storefront = (await api(app).get(`/public/stores/${s.store.slug}`).expect(200)).body;
    expect(storefront.showBadge).toBe(true);
  });

  it('accepts orders above the monthly quota but locks them until the merchant upgrades', async () => {
    const s = await setupStore(app, 'Quota');
    await downgradeToFree(s.store.id);
    await prisma.plan.update({ where: { code: 'free' }, data: { limits: { ordersPerMonth: 1, products: 10, members: 1, customDomain: false, couriers: false, pixels: false, promoCodes: false, agents: false, sheets: false, showPlatformBadge: true } } });
    try {
      await order(s).expect(201);
      const over = (await order(s).expect(201)).body;
      const locked = await prisma.order.findUniqueOrThrow({ where: { id: over.orderId } });
      expect(locked.flags).toContain('OVER_PLAN_LIMIT');
      const res = await s.a.post(`/stores/${s.store.id}/orders/${over.orderId}/status`, { status: 'CONFIRMED' }).expect(402);
      expect(res.body.code).toBe('ORDER_OVER_LIMIT');
      expect((await s.a.get(`/stores/${s.store.id}/billing`).expect(200)).body.lockedOrders).toBe(1);

      const c = (await s.a.post(`/stores/${s.store.id}/billing/checkout`, { planCode: 'starter', phone: nextPhone() }).expect(201)).body;
      await api(app).post(`/billing/simulator/${c.payment.reference}`, { outcome: 'SUCCEEDED' }).expect(200);
      await s.a.post(`/stores/${s.store.id}/orders/${over.orderId}/status`, { status: 'CONFIRMED' }).expect(201);
    } finally {
      await prisma.plan.update({ where: { code: 'free' }, data: { limits: { ordersPerMonth: 50, products: 10, members: 1, customDomain: false, couriers: false, pixels: false, promoCodes: false, agents: false, sheets: false, showPlatformBadge: true } } });
    }
  });
});

describe('Codes promo', () => {
  it('applies a percentage code, counts uses and refuses an exhausted code', async () => {
    const s = await setupStore(app, 'Promo');
    await s.a.post(`/stores/${s.store.id}/promo-codes`, { code: 'bienvenue10', type: 'PERCENT', value: 10, usageLimit: 1 }).expect(201);
    await s.a.post(`/stores/${s.store.id}/promo-codes`, { code: 'BIENVENUE10', type: 'FIXED', value: 500 }).expect(409);

    const preview = (await api(app).post(`/public/stores/${s.store.slug}/promo/validate`, { code: 'Bienvenue10', subtotal: 10000, deliveryFee: 1000 }).expect(200)).body;
    expect(preview.discount).toBe(1000);
    expect((await api(app).get(`/public/stores/${s.store.slug}`).expect(200)).body.promoCodes).toBe(true);

    const created = (await order(s, { promoCode: 'bienvenue10' }).expect(201)).body;
    expect(created.total).toBe(10000 + 1000 - 1000);
    const detail = (await s.a.get(`/stores/${s.store.id}/orders/${created.orderId}`).expect(200)).body;
    expect(detail).toMatchObject({ discount: 1000, promoCode: 'BIENVENUE10' });

    const again = await order(s, { promoCode: 'BIENVENUE10' }).expect(400);
    expect(again.body.code).toBe('PROMO_EXHAUSTED');
  });

  it('free delivery with a minimum basket', async () => {
    const s = await setupStore(app, 'Promo livraison');
    await s.a.post(`/stores/${s.store.id}/promo-codes`, { code: 'LIVRAISON', type: 'FREE_SHIPPING', minSubtotal: 15000 }).expect(201);
    expect((await order(s, { promoCode: 'LIVRAISON' }).expect(400)).body.code).toBe('PROMO_MIN_SUBTOTAL');
    const ok = (await order(s, { promoCode: 'LIVRAISON', quantity: 2 }).expect(201)).body;
    expect(ok.total).toBe(18000);
  });
});

describe('Application livreur', () => {
  async function courierSetup(name: string) {
    const s = await setupStore(app, name);
    const phone = nextPhone();
    const courier = (await s.a.post(`/stores/${s.store.id}/couriers`, { name: 'Koffi', phone, commission: 500 }).expect(201)).body;
    const { pin } = (await s.a.post(`/stores/${s.store.id}/couriers/${courier.id}/pin`, {}).expect(201)).body;
    expect(pin).toMatch(/^\d{4}$/);
    const orders = [];
    for (let i = 0; i < 2; i++) {
      const o = (await order(s).expect(201)).body;
      await s.a.post(`/stores/${s.store.id}/orders/${o.orderId}/status`, { status: 'CONFIRMED' }).expect(201);
      await s.a.post(`/stores/${s.store.id}/orders/${o.orderId}/assign`, { courierId: courier.id }).expect(201);
      orders.push(o);
    }
    return { s, phone, pin, courier, orders };
  }

  it('signs in with phone + PIN and locks after 5 wrong PINs', async () => {
    const { phone, pin, s } = await courierSetup('Livreur PIN');
    const login = (await api(app).post('/auth/courier/login', { phone, country: 'CI', pin }).expect(200)).body;
    const mine = (await api(app, login.accessToken).get(`/stores/${s.store.id}/deliveries/mine`).expect(200)).body;
    expect(mine.orders).toHaveLength(2);
    expect(mine.courier.name).toBe('Koffi');

    const wrong = pin === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) await api(app).post('/auth/courier/login', { phone, country: 'CI', pin: wrong }).expect(401);
    expect((await api(app).post('/auth/courier/login', { phone, country: 'CI', pin }).expect(429)).body.code).toBe('PIN_LOCKED');
  });

  it('replays offline actions once, even when the queue is sent twice', async () => {
    const { phone, pin, s, orders, courier } = await courierSetup('Livreur hors ligne');
    const token = (await api(app).post('/auth/courier/login', { phone, country: 'CI', pin }).expect(200)).body.accessToken;
    const c = api(app, token);
    const at = new Date(Date.now() - 20 * 60_000).toISOString();
    const actions = [
      { id: randomUUID(), orderId: orders[0].orderId, status: 'DELIVERED', at },
      { id: randomUUID(), orderId: orders[1].orderId, status: 'REFUSED', reason: 'Client absent', at },
    ];
    const first = (await c.post(`/stores/${s.store.id}/deliveries/sync`, { actions }).expect(200)).body;
    expect(first.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(first.deliveries.orders).toHaveLength(0);
    expect(first.deliveries.courier.cashBalance).toBe(orders[0].total);

    const second = (await c.post(`/stores/${s.store.id}/deliveries/sync`, { actions }).expect(200)).body;
    expect(second.results.every((r: { duplicate?: boolean }) => r.duplicate)).toBe(true);
    const fresh = await prisma.courier.findUniqueOrThrow({ where: { id: courier.id } });
    expect(fresh.cashBalance).toBe(orders[0].total);

    const events = await prisma.orderEvent.findMany({ where: { orderId: orders[0].orderId, type: 'STATUS', toStatus: 'DELIVERED' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.note).toContain('hors connexion');
  });

  it('reports conflicts instead of failing the whole sync', async () => {
    const { phone, pin, s, orders } = await courierSetup('Livreur conflit');
    const token = (await api(app).post('/auth/courier/login', { phone, country: 'CI', pin }).expect(200)).body.accessToken;
    await s.a.post(`/stores/${s.store.id}/orders/${orders[0].orderId}/status`, { status: 'DELIVERED' }).expect(201);
    const res = (await api(app, token).post(`/stores/${s.store.id}/deliveries/sync`, {
      actions: [
        { id: randomUUID(), orderId: orders[0].orderId, status: 'REFUSED', reason: 'x', at: new Date().toISOString() },
        { id: randomUUID(), orderId: orders[1].orderId, status: 'DELIVERED', at: new Date().toISOString() },
      ],
    }).expect(200)).body;
    expect(res.results.map((r: { ok: boolean }) => r.ok)).toEqual([false, true]);
  });
});

describe('Statistiques', () => {
  it('computes rates, profit and breakdowns, and exports CSV', async () => {
    const s = await setupStore(app, 'Stats');
    await prisma.product.update({ where: { id: s.product.id }, data: { cost: 4000 } });
    const courier = (await s.a.post(`/stores/${s.store.id}/couriers`, { name: 'Moussa', phone: nextPhone(), commission: 500 }).expect(201)).body;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await order(s, { source: i === 0 ? 'tiktok' : 'facebook' }).expect(201)).body.orderId);
    for (const id of ids.slice(0, 2)) {
      await s.a.post(`/stores/${s.store.id}/orders/${id}/status`, { status: 'CONFIRMED' }).expect(201);
      await s.a.post(`/stores/${s.store.id}/orders/${id}/assign`, { courierId: courier.id }).expect(201);
    }
    await s.a.post(`/stores/${s.store.id}/orders/${ids[0]}/status`, { status: 'DELIVERED' }).expect(201);
    await s.a.post(`/stores/${s.store.id}/orders/${ids[1]}/status`, { status: 'REFUSED', reason: 'Absent' }).expect(201);
    const today = new Date().toISOString().slice(0, 10);
    await s.a.post(`/stores/${s.store.id}/stats/ad-spends`, { day: today, channel: 'tiktok', amount: 2000 }).expect(201);

    const r = (await s.a.get(`/stores/${s.store.id}/stats/report?from=${today}&to=${today}`).expect(200)).body;
    expect(r.totals).toMatchObject({ orders: 3, confirmed: 2, delivered: 1, refused: 1, confirmationRate: 67, deliveryRate: 50 });
    expect(r.totals.revenue).toBe(11000);
    expect(r.totals.profit).toBe(11000 - 4000 - 500 - 2000);
    expect(r.bySource.find((x: { key: string }) => x.key === 'tiktok')).toMatchObject({ orders: 1, delivered: 1 });
    expect(r.byCourier[0]).toMatchObject({ label: 'Moussa', delivered: 1, refused: 1 });

    const csv = await s.a.get(`/stores/${s.store.id}/stats/orders.csv?from=${today}&to=${today}`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n').filter(Boolean)).toHaveLength(4);
  });
});

describe('Back-office super-admin', () => {
  async function superAdmin() {
    const phone = nextPhone();
    await signInWithPhone(app, phone, 'Admin');
    await prisma.user.update({ where: { phone: `+225${phone}` }, data: { isSuperAdmin: true } });
    return signInWithPhone(app, phone);
  }

  it('is closed to merchants', async () => {
    const s = await setupStore(app, 'Pas admin');
    await s.a.get('/admin/overview').expect(403);
    await api(app).get('/admin/overview').expect(401);
  });

  it('shows the overview, suspends a store (storefront hidden) and grants a plan, all audited', async () => {
    const admin = api(app, (await superAdmin()).accessToken);
    const s = await setupStore(app, 'À suspendre');
    const overview = (await admin.get('/admin/overview').expect(200)).body;
    expect(overview.stores.total).toBeGreaterThan(0);
    expect(overview.signups).toHaveLength(30);

    const list = (await admin.get(`/admin/stores?q=${encodeURIComponent('À suspendre')}`).expect(200)).body;
    expect(list.items[0].id).toBe(s.store.id);

    await admin.post(`/admin/stores/${s.store.id}/suspend`, { reason: 'Produits interdits' }).expect(200);
    await api(app).get(`/public/stores/${s.store.slug}`).expect(404);
    await s.a.post(`/stores/${s.store.id}/products`, { title: 'Bloqué', price: 1000 }).expect(403);
    await admin.post(`/admin/stores/${s.store.id}/unsuspend`).expect(200);
    await api(app).get(`/public/stores/${s.store.slug}`).expect(200);

    const detail = (await admin.post(`/admin/stores/${s.store.id}/plan`, { planCode: 'business', days: 30 }).expect(200)).body;
    expect(detail.planCode).toBe('business');
    expect(detail.audit.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['admin.suspend', 'admin.unsuspend', 'admin.grant_plan']));

    const imp = (await admin.post(`/admin/stores/${s.store.id}/impersonate`).expect(200)).body;
    await api(app, imp.accessToken).get(`/stores/${s.store.id}`).expect(200);
    await api(app, imp.accessToken).get('/admin/overview').expect(403);
  });
});
