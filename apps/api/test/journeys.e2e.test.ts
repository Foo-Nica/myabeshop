/**
 * Automated tests of the MVP acceptance criteria (cahier des charges §13):
 * parcours A (merchant launches a store), B (customer orders without an account),
 * C (merchant processes the order up to cash collection).
 */
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { api, createTestApp, nextPhone, setupStore, signInWithPhone } from './helpers';
import type { MessagingService } from '../src/notifications/messaging.service';

let app: INestApplication;
let messaging: MessagingService;
let baseUrl: string;
/** Unique per run so the non-wiped test database never collides with earlier runs. */
const RUN = Date.now().toString(36);

beforeAll(async () => {
  ({ app, messaging } = await createTestApp());
  await app.listen(0);
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app?.close();
});

describe('Parcours A — le marchand lance sa boutique', () => {
  it('signs up by phone OTP, creates a store with a reserved subdomain, zones and a product', async () => {
    const phone = nextPhone();
    const http = api(app);
    const otp = await http.post('/auth/otp/request', { target: phone, country: 'CI' }).expect(200);
    expect(otp.body.devCode).toMatch(/^\d{6}$/);
    expect(messaging.outbox.at(-1)?.text).toContain(otp.body.devCode);

    await http.post('/auth/otp/verify', { target: phone, country: 'CI', code: '000000' }).expect(400);
    const session = await http.post('/auth/otp/verify', { target: phone, country: 'CI', code: otp.body.devCode, name: 'Awa' }).expect(200);
    const a = api(app, session.body.accessToken);

    const name = `Chez Awa Cosmétiques ${RUN}`;
    const slug = `chez-awa-cosmetiques-${RUN}`;
    const availability = await a.get(`/stores/slug-availability?name=${encodeURIComponent(name)}`).expect(200);
    expect(availability.body.suggestion).toBe(slug);

    const store = await a.post('/stores', { name, country: 'CI', category: 'beauty' }).expect(201);
    expect(store.body.slug).toBe(slug);
    expect(store.body.currency).toBe('XOF');
    expect(store.body.role).toBe('OWNER');

    // A second store with the same name gets a different subdomain.
    const other = await signInWithPhone(app, nextPhone());
    const clash = await api(app, other.accessToken).post('/stores', { name, country: 'CI' }).expect(201);
    expect(clash.body.slug).toBe(`${slug}-2`);
    await api(app, other.accessToken).post('/stores', { name: 'XY', slug, country: 'CI' }).expect(409);

    const zone = await a.post(`/stores/${store.body.id}/zones`, { name: 'Cocody', city: 'Abidjan', fee: 1000 }).expect(201);
    expect(zone.body.fee).toBe(1000);

    const product = await a
      .post(`/stores/${store.body.id}/products`, {
        title: 'Savon noir africain',
        description: 'Savon traditionnel',
        price: 3000,
        status: 'PUBLISHED',
        options: ['Parfum'],
        variants: [{ options: { Parfum: 'Nature' } }, { options: { Parfum: 'Citron' }, price: 3500 }],
      })
      .expect(201);
    expect(product.body.shortCode).toHaveLength(7);
    expect(product.body.shortUrl).toBe(`http://localhost:3000/p/${product.body.shortCode}`);
    expect(product.body.variants.map((v: { title: string }) => v.title)).toEqual(['Nature', 'Citron']);

    const me = await a.get('/auth/me').expect(200);
    expect(me.body.memberships).toHaveLength(1);
  });

  it('rejects invalid input with field errors', async () => {
    const { a, store } = await setupStore(app, 'Validation');
    const res = await a.post(`/stores/${store.id}/products`, { title: 'X', price: -5 }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const bad = await a.post(`/stores/${store.id}/products`, { title: 'Promo', price: 5000, compareAtPrice: 4000 }).expect(400);
    expect(bad.body.issues[0].path).toBe('compareAtPrice');
  });

  it('refreshes and rotates tokens', async () => {
    const s = await signInWithPhone(app, nextPhone());
    const r1 = await api(app).post('/auth/refresh', { refreshToken: s.refreshToken }).expect(200);
    await api(app).post('/auth/refresh', { refreshToken: s.refreshToken }).expect(401);
    await api(app, r1.body.accessToken).get('/auth/me').expect(200);
  });

  it('supports e-mail + password accounts', async () => {
    const email = `marchand${Date.now()}@exemple.com`;
    await api(app).post('/auth/register', { name: 'Kofi', email, password: 'motdepasse123' }).expect(201);
    await api(app).post('/auth/login', { email, password: 'mauvais-mdp' }).expect(401);
    const ok = await api(app).post('/auth/login', { email, password: 'motdepasse123' }).expect(200);
    expect(ok.body.user.email).toBe(email);
  });
});

describe('Parcours B — le client commande sans compte', () => {
  it('orders from the short product link, with zone fee and quantity offer', async () => {
    const { store, zones, product } = await setupStore(app, 'Parcours B');
    const pub = api(app);

    const page = await pub.get(`/public/p/${product.shortCode}`).expect(200);
    expect(page.body.product.title).toBe('Crème éclaircissante');
    expect(page.body.product).not.toHaveProperty('cost');
    expect(page.body.store.zones).toHaveLength(2);
    expect(page.body.store.dialCode).toBe('225');

    const order = await pub
      .post(`/public/stores/${store.slug}/orders`, {
        productId: product.id,
        quantity: 2,
        customerName: 'Fatou Diallo',
        customerPhone: '05 44 55 66 77',
        zoneId: zones.find((z: { name: string }) => z.name === 'Bouaké').id,
        address: 'Derrière la pharmacie du marché',
        source: 'facebook',
        utm: { utm_campaign: 'promo-novembre' },
      })
      .expect(201);
    // 2 for 18 000 F + 3 000 F delivery to Bouaké.
    expect(order.body.total).toBe(21000);
    expect(order.body.number).toBe(1);

    const sms = messaging.outbox.at(-1)!;
    expect(sms.to).toBe('+2250544556677');
    expect(sms.text).toContain(`/t/${order.body.trackingToken}`);

    const tracking = await pub.get(`/public/track/${order.body.trackingToken}`).expect(200);
    expect(tracking.body.status).toBe('NEW');
    expect(tracking.body.items[0].quantity).toBe(2);
    expect(tracking.body).not.toHaveProperty('customerPhone');
  });

  it('applies free delivery above the zone threshold', async () => {
    const { store, zones, product } = await setupStore(app, 'Livraison offerte');
    const order = await api(app)
      .post(`/public/stores/${store.slug}/orders`, {
        productId: product.id,
        quantity: 4,
        customerName: 'Moussa',
        customerPhone: nextPhone(),
        zoneId: zones.find((z: { name: string }) => z.name === 'Cocody').id,
        address: 'Riviera 2',
      })
      .expect(201);
    expect(order.body.total).toBe(36000);
  });

  it('validates the phone format, blocks unserved zones and flags duplicates', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Anti-fraude');
    const pub = api(app);
    const base = { productId: product.id, quantity: 1, customerName: 'Client', zoneId: zones[0].id, address: 'Rue 12' };

    const bad = await pub.post(`/public/stores/${store.slug}/orders`, { ...base, customerPhone: '12345678' }).expect(400);
    expect(bad.body.code).toBe('INVALID_PHONE');

    const unserved = await pub.post(`/public/stores/${store.slug}/orders`, { ...base, customerPhone: nextPhone(), zoneId: 'OTHER', city: 'Korhogo' }).expect(400);
    expect(unserved.body.code).toBe('ZONE_NOT_SERVED');

    const phone = nextPhone();
    await pub.post(`/public/stores/${store.slug}/orders`, { ...base, customerPhone: phone }).expect(201);
    await pub.post(`/public/stores/${store.slug}/orders`, { ...base, customerPhone: phone }).expect(201);
    const list = await a.get(`/stores/${store.id}/orders`).expect(200);
    expect(list.body.items[0].flags).toContain('DUPLICATE');

    await a.patch(`/stores/${store.id}`, { maxOrdersPerPhonePerDay: 2 }).expect(200);
    const limited = await pub.post(`/public/stores/${store.slug}/orders`, { ...base, customerPhone: phone }).expect(429);
    expect(limited.body.code).toBe('ORDER_LIMIT');
  });

  it('refuses orders while the store is closed', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Fermée');
    await a.patch(`/stores/${store.id}`, { closed: true, closedMessage: 'De retour lundi' }).expect(200);
    const res = await api(app)
      .post(`/public/stores/${store.slug}/orders`, { productId: product.id, quantity: 1, customerName: 'Ali', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 1' })
      .expect(400);
    expect(res.body.message).toBe('De retour lundi');
  });

  it('does not show draft products publicly', async () => {
    const { a, store } = await setupStore(app, 'Brouillons');
    const draft = (await a.post(`/stores/${store.id}/products`, { title: 'Brouillon', price: 1000 }).expect(201)).body;
    await api(app).get(`/public/p/${draft.shortCode}`).expect(404);
    const list = await api(app).get(`/public/stores/${store.slug}/products`).expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).not.toContain(draft.id);
  });
});

describe('Parcours C — le marchand traite la commande', () => {
  it('notifies in real time, confirms, assigns a courier, delivers and reconciles cash', async () => {
    const { owner, a, store, zones, product } = await setupStore(app, 'Parcours C');

    // The merchant dashboard listens for new orders.
    const socket: Socket = io(`${baseUrl}/realtime`, { auth: { token: owner.accessToken }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const joined = await socket.emitWithAck('join', { storeId: store.id });
    expect(joined.ok).toBe(true);
    const received = new Promise<{ number: number; at: number }>((resolve) =>
      socket.on('order.created', (o: { number: number }) => resolve({ ...o, at: Date.now() })),
    );

    const sentAt = Date.now();
    const created = await api(app)
      .post(`/public/stores/${store.slug}/orders`, {
        productId: product.id,
        quantity: 1,
        customerName: 'Aminata',
        customerPhone: '0102030405',
        zoneId: zones[0].id,
        address: 'Angré, près de la station',
        gps: { lat: 5.39, lng: -3.98 },
      })
      .expect(201);
    const push = await received;
    expect(push.number).toBe(created.body.number);
    expect(push.at - sentAt).toBeLessThan(5000);
    socket.close();

    // Order card: call and WhatsApp in one click, with a pre-filled recap.
    const detail = await a.get(`/stores/${store.id}/orders/${created.body.orderId}`).expect(200);
    expect(detail.body.callUrl).toBe('tel:+2250102030405');
    expect(decodeURIComponent(detail.body.whatsappUrl)).toContain('commande n°1');
    expect(detail.body.total).toBe(11000);

    await a.post(`/stores/${store.id}/orders/${created.body.orderId}/contact`, { channel: 'CALL' }).expect(201);
    const unreachable = await a.post(`/stores/${store.id}/orders/${created.body.orderId}/status`, { status: 'UNREACHABLE' }).expect(201);
    expect(unreachable.body.callAttempts).toBe(2);

    // Cannot jump straight to DELIVERED.
    const jump = await a.post(`/stores/${store.id}/orders/${created.body.orderId}/status`, { status: 'DELIVERED' }).expect(409);
    expect(jump.body.code).toBe('INVALID_TRANSITION');

    const confirmed = await a.post(`/stores/${store.id}/orders/${created.body.orderId}/status`, { status: 'CONFIRMED' }).expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(messaging.outbox.at(-1)?.text).toContain('confirmée');

    // Courier: created by the merchant, signs in with their phone, sees only their parcels.
    const courierPhone = nextPhone();
    const courier = (await a.post(`/stores/${store.id}/couriers`, { name: 'Ibrahim', phone: courierPhone, commission: 500 }).expect(201)).body;
    const assigned = await a.post(`/stores/${store.id}/orders/${created.body.orderId}/assign`, { courierId: courier.id }).expect(201);
    expect(assigned.body.status).toBe('SHIPPED');
    expect(assigned.body.courierName).toBe('Ibrahim');

    const courierSession = await signInWithPhone(app, courierPhone);
    const c = api(app, courierSession.accessToken);
    const mine = await c.get(`/stores/${store.id}/deliveries/mine`).expect(200);
    expect(mine.body.orders).toHaveLength(1);
    expect(mine.body.orders[0].gps).toEqual({ lat: 5.39, lng: -3.98 });
    await c.get(`/stores/${store.id}/products`).expect(403);
    await c.get(`/stores/${store.id}/couriers`).expect(403);
    await c.post(`/stores/${store.id}/orders/${created.body.orderId}/status`, { status: 'CANCELLED' }).expect(403);

    const delivered = await c.post(`/stores/${store.id}/orders/${created.body.orderId}/status`, { status: 'DELIVERED' }).expect(201);
    expect(delivered.body.status).toBe('DELIVERED');

    // Cash due by the courier, then remitted at the end of the day.
    const couriers = await a.get(`/stores/${store.id}/couriers`).expect(200);
    expect(couriers.body[0].cashBalance).toBe(11000);
    const report = await a.get(`/stores/${store.id}/couriers/${courier.id}/report`).expect(200);
    expect(report.body).toMatchObject({ delivered: 1, cashExpected: 11000, cashRemitted: 0, gap: 11000, commissionDue: 500 });
    await a.post(`/stores/${store.id}/couriers/${courier.id}/remittances`, { amount: 11000, method: 'cash' }).expect(201);
    const after = await a.get(`/stores/${store.id}/couriers`).expect(200);
    expect(after.body[0].cashBalance).toBe(0);

    // Full, attributed history.
    const history = (await a.get(`/stores/${store.id}/orders/${created.body.orderId}`).expect(200)).body.events;
    expect(history.map((e: { type: string; toStatus: string | null }) => e.toStatus ?? e.type)).toEqual([
      'NEW',
      'CALL',
      'UNREACHABLE',
      'CONFIRMED',
      'ASSIGN',
      'SHIPPED',
      'DELIVERED',
    ]);
    expect(history.at(-1).userName).toBe('Ibrahim');

    const stats = await a.get(`/stores/${store.id}/stats`).expect(200);
    expect(stats.body).toMatchObject({ revenueCollected: 11000, deliveryRate: 100, confirmationRate: 100 });
  });

  it('refusal needs a reason and lowers the customer score', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Refus');
    const courier = (await a.post(`/stores/${store.id}/couriers`, { name: 'Yao', phone: nextPhone() }).expect(201)).body;
    const phone = nextPhone();
    const o = (
      await api(app)
        .post(`/public/stores/${store.slug}/orders`, { productId: product.id, quantity: 1, customerName: 'Paul', customerPhone: phone, zoneId: zones[0].id, address: 'Rue 2' })
        .expect(201)
    ).body;
    await a.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'CONFIRMED' }).expect(201);
    await a.post(`/stores/${store.id}/orders/${o.orderId}/assign`, { courierId: courier.id }).expect(201);
    const noReason = await a.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'REFUSED' }).expect(400);
    expect(noReason.body.code).toBe('REASON_REQUIRED');
    const refused = await a.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'REFUSED', reason: 'Client absent' }).expect(201);
    expect(refused.body.refusalReason).toBe('Client absent');
    expect(refused.body.customer.score).toBe(0);
  });

  it('decrements stock on confirmation and restores it on cancellation', async () => {
    const { a, store, zones } = await setupStore(app, 'Stock');
    const p = (
      await a.post(`/stores/${store.id}/products`, { title: 'Montre', price: 20000, status: 'PUBLISHED', trackStock: true, stock: 3 }).expect(201)
    ).body;
    const o = (
      await api(app)
        .post(`/public/stores/${store.slug}/orders`, { productId: p.id, quantity: 2, customerName: 'Eric', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 3' })
        .expect(201)
    ).body;
    expect((await a.get(`/stores/${store.id}/products/${p.id}`)).body.stock).toBe(3);
    await a.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'CONFIRMED' }).expect(201);
    expect((await a.get(`/stores/${store.id}/products/${p.id}`)).body.stock).toBe(1);
    await a.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'CANCELLED' }).expect(201);
    expect((await a.get(`/stores/${store.id}/products/${p.id}`)).body.stock).toBe(3);

    const tooMany = await api(app)
      .post(`/public/stores/${store.slug}/orders`, { productId: p.id, quantity: 4, customerName: 'Eric', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 3' })
      .expect(409);
    expect(tooMany.body.code).toBe('OUT_OF_STOCK');
  });

  it('edits an order before shipping and recomputes the totals', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Edition');
    const o = (
      await api(app)
        .post(`/public/stores/${store.slug}/orders`, { productId: product.id, quantity: 1, customerName: 'Ada', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 4' })
        .expect(201)
    ).body;
    const detail = (await a.get(`/stores/${store.id}/orders/${o.orderId}`)).body;
    const edited = await a
      .patch(`/stores/${store.id}/orders/${o.orderId}`, { items: [{ id: detail.items[0].id, quantity: 2 }], zoneId: zones[1].id })
      .expect(200);
    expect(edited.body.subtotal).toBe(18000);
    expect(edited.body.deliveryFee).toBe(3000);
    expect(edited.body.total).toBe(21000);
  });

  it('lets the merchant type in a phone order', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Manuelle');
    const res = await a
      .post(`/stores/${store.id}/orders`, { productId: product.id, quantity: 1, customerName: 'Awa', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 5' })
      .expect(201);
    expect(res.body.source).toBe('manual');
    expect(res.body.events[0].userName).toBe('Propriétaire Manuelle');
  });
});

describe('Rôles et permissions', () => {
  it('confirmation agents see only their assigned orders and cannot touch products', async () => {
    const { a, store, zones, product } = await setupStore(app, 'Agents');
    const agentPhone = nextPhone();
    await a.post(`/stores/${store.id}/members`, { name: 'Agent Sali', target: agentPhone, role: 'AGENT' }).expect(201);
    const agent = api(app, (await signInWithPhone(app, agentPhone)).accessToken);

    const o = (
      await api(app)
        .post(`/public/stores/${store.slug}/orders`, { productId: product.id, quantity: 1, customerName: 'Ben', customerPhone: nextPhone(), zoneId: zones[0].id, address: 'Rue 6' })
        .expect(201)
    ).body;
    // New orders are dispatched automatically to the agent.
    const list = await agent.get(`/stores/${store.id}/orders`).expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([o.orderId]);
    await agent.post(`/stores/${store.id}/orders/${o.orderId}/status`, { status: 'CONFIRMED' }).expect(201);

    await agent.post(`/stores/${store.id}/products`, { title: 'Hack', price: 1 }).expect(403);
    await agent.get(`/stores/${store.id}/stats`).expect(403);
    await agent.patch(`/stores/${store.id}`, { name: 'Pirate' }).expect(403);
    await agent.get(`/stores/${store.id}/members`).expect(403);

    // A manager cannot manage the team (owner only).
    const managerPhone = nextPhone();
    await a.post(`/stores/${store.id}/members`, { name: 'Gérant', target: managerPhone, role: 'MANAGER' }).expect(201);
    const manager = api(app, (await signInWithPhone(app, managerPhone)).accessToken);
    await manager.post(`/stores/${store.id}/products`, { title: 'Nouveau produit', price: 1000 }).expect(201);
    await manager.post(`/stores/${store.id}/members`, { name: 'X', target: nextPhone(), role: 'MANAGER' }).expect(403);
  });

  it('requires authentication for back-office routes', async () => {
    await api(app).get('/stores').expect(401);
    await api(app, 'not-a-token').get('/stores').expect(401);
  });
});

describe('Isolation stricte entre boutiques', () => {
  it('a merchant can never read or change another store’s data', async () => {
    const A = await setupStore(app, 'Boutique A');
    const B = await setupStore(app, 'Boutique B');
    const order = (
      await api(app)
        .post(`/public/stores/${A.store.slug}/orders`, { productId: A.product.id, quantity: 1, customerName: 'Client A', customerPhone: nextPhone(), zoneId: A.zones[0].id, address: 'Rue A' })
        .expect(201)
    ).body;
    const courierA = (await A.a.post(`/stores/${A.store.id}/couriers`, { name: 'Livreur A', phone: nextPhone() }).expect(201)).body;

    // Direct access to store A routes with B's token: same 404 as a store that does not exist.
    for (const path of ['', '/orders', '/products', '/zones', '/couriers', '/stats', `/orders/${order.orderId}`, `/products/${A.product.id}`]) {
      const res = await B.a.get(`/stores/${A.store.id}${path}`);
      expect(res.status, path).toBe(404);
    }
    await B.a.patch(`/stores/${A.store.id}`, { name: 'Pirate' }).expect(404);
    await B.a.post(`/stores/${A.store.id}/orders/${order.orderId}/status`, { status: 'CANCELLED' }).expect(404);

    // Using A's ids through B's own store routes: not found either.
    await B.a.get(`/stores/${B.store.id}/orders/${order.orderId}`).expect(404);
    await B.a.get(`/stores/${B.store.id}/products/${A.product.id}`).expect(404);
    await B.a.patch(`/stores/${B.store.id}/products/${A.product.id}`, { price: 1 }).expect(404);
    await B.a.delete(`/stores/${B.store.id}/products/${A.product.id}`).expect(404);
    await B.a.patch(`/stores/${B.store.id}/zones/${A.zones[0].id}`, { fee: 0 }).expect(404);
    await B.a.post(`/stores/${B.store.id}/orders/${order.orderId}/status`, { status: 'CONFIRMED' }).expect(404);
    await B.a.post(`/stores/${B.store.id}/couriers/${courierA.id}/remittances`, { amount: 100, method: 'cash' }).expect(404);

    // B cannot assign A's courier to its own orders, nor use A's product or zone at checkout.
    const orderB = (
      await api(app)
        .post(`/public/stores/${B.store.slug}/orders`, { productId: B.product.id, quantity: 1, customerName: 'Client B', customerPhone: nextPhone(), zoneId: B.zones[0].id, address: 'Rue B' })
        .expect(201)
    ).body;
    await B.a.post(`/stores/${B.store.id}/orders/${orderB.orderId}/assign`, { courierId: courierA.id }).expect(404);
    await api(app)
      .post(`/public/stores/${B.store.slug}/orders`, { productId: A.product.id, quantity: 1, customerName: 'Xavier', customerPhone: nextPhone(), zoneId: B.zones[0].id, address: 'Rue' })
      .expect(404);
    await api(app)
      .post(`/public/stores/${B.store.slug}/orders`, { productId: B.product.id, quantity: 1, customerName: 'Xavier', customerPhone: nextPhone(), zoneId: A.zones[0].id, address: 'Rue' })
      .expect(400);

    // Lists only ever contain the store's own rows.
    const listB = await B.a.get(`/stores/${B.store.id}/orders`).expect(200);
    expect(listB.body.items.map((i: { id: string }) => i.id)).toEqual([orderB.orderId]);
    const productsB = await B.a.get(`/stores/${B.store.id}/products`).expect(200);
    expect(productsB.body.map((p: { id: string }) => p.id)).toEqual([B.product.id]);

    // And A's data is untouched.
    const stillA = await A.a.get(`/stores/${A.store.id}/orders/${order.orderId}`).expect(200);
    expect(stillA.body.status).toBe('NEW');
    expect((await A.a.get(`/stores/${A.store.id}`)).body.name).toBe('Boutique A');
  });

  it('realtime rooms are isolated too', async () => {
    const A = await setupStore(app, 'Temps réel A');
    const B = await setupStore(app, 'Temps réel B');
    const socket: Socket = io(`${baseUrl}/realtime`, { auth: { token: B.owner.accessToken }, transports: ['websocket'] });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    expect((await socket.emitWithAck('join', { storeId: A.store.id })).ok).toBe(false);
    let leaked = false;
    socket.on('order.created', () => (leaked = true));
    await api(app)
      .post(`/public/stores/${A.store.slug}/orders`, { productId: A.product.id, quantity: 1, customerName: 'Céline', customerPhone: nextPhone(), zoneId: A.zones[0].id, address: 'Rue' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 300));
    socket.close();
    expect(leaked).toBe(false);
  });
});
