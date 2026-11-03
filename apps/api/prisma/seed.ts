/**
 * Seeds subscription plans (cahier des charges §9.1, prix indicatifs) and, with SEED_DEMO=true,
 * a demo store with products, zones and a courier.
 */
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createPrismaClient } from '../src/common/prisma.service';

const prisma = createPrismaClient();

const PLANS = [
  { code: 'free', name: 'Gratuit', price: 0, limits: { ordersPerMonth: 50, products: 10, members: 1, customDomain: false, couriers: false, pixels: false, promoCodes: false, agents: false, sheets: false, showPlatformBadge: true } },
  { code: 'starter', name: 'Starter', price: 5000, limits: { ordersPerMonth: 500, products: 100, members: 3, customDomain: false, couriers: true, pixels: true, promoCodes: true, agents: false, sheets: false, showPlatformBadge: false } },
  { code: 'pro', name: 'Pro', price: 15000, limits: { ordersPerMonth: 3000, products: null, members: 10, customDomain: true, couriers: true, pixels: true, promoCodes: true, agents: true, sheets: true, showPlatformBadge: false } },
  { code: 'business', name: 'Business', price: 35000, limits: { ordersPerMonth: null, products: null, members: null, customDomain: true, couriers: true, pixels: true, promoCodes: true, agents: true, sheets: true, api: true, multiStore: true, showPlatformBadge: false } },
];

async function main() {
  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, create: { ...p, currency: 'XOF' }, update: { name: p.name, price: p.price, limits: p.limits } });
  }
  console.log(`Plans: ${PLANS.map((p) => p.code).join(', ')}`);

  if (process.env.SEED_DEMO === 'true') {
    const pro = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });
    const owner = await prisma.user.upsert({
      where: { phone: '+2250707070707' },
      create: { phone: '+2250707070707', name: 'Awa Demo' },
      update: {},
    });
    const existing = await prisma.store.findUnique({ where: { slug: 'demo' } });
    if (!existing) {
      const store = await prisma.store.create({
        data: {
          name: 'Boutique Démo',
          slug: 'demo',
          country: 'CI',
          currency: 'XOF',
          category: 'beauty',
          whatsappPhone: '+2250707070707',
          description: 'Cosmétiques naturels livrés à Abidjan. Paiement à la livraison.',
          planId: pro.id,
          members: { create: { userId: owner.id, role: 'OWNER' } },
          zones: {
            create: [
              { name: 'Cocody', city: 'Abidjan', fee: 1000, delay: '24 h', position: 0 },
              { name: 'Yopougon', city: 'Abidjan', fee: 1500, delay: '24 h', position: 1 },
              { name: 'Marcory', city: 'Abidjan', fee: 1000, delay: '24 h', freeAbove: 30000, position: 2 },
              { name: 'Bouaké', city: 'Bouaké', fee: 3000, delay: '48–72 h', position: 3 },
            ],
          },
          couriers: { create: { name: 'Koffi', phone: '+2250101010101', commission: 500 } },
        },
      });
      await prisma.product.create({
        data: {
          storeId: store.id,
          title: 'Beurre de karité pur 250 g',
          slug: 'beurre-de-karite-pur-250-g',
          shortCode: 'demo123',
          description: 'Beurre de karité 100 % naturel, non raffiné. Idéal pour la peau et les cheveux.',
          price: 5000,
          compareAtPrice: 7500,
          cost: 1800,
          status: 'PUBLISHED',
          quantityOffers: { create: [{ storeId: store.id, quantity: 2, price: 9000 }, { storeId: store.id, quantity: 3, price: 12000 }] },
        },
      });
      console.log('Boutique démo : /s/demo, lien produit /p/demo123, propriétaire +225 07 07 07 07 07');
    }
    await seedDemoActivity();
  }

  // Platform super-admin (back-office /admin). In production set SUPER_ADMIN_PHONE once.
  const adminPhone = process.env.SUPER_ADMIN_PHONE ?? (process.env.SEED_DEMO === 'true' ? '+2250102030405' : null);
  if (adminPhone) {
    await prisma.user.upsert({
      where: { phone: adminPhone },
      create: { phone: adminPhone, name: 'Équipe Myabéshop', isSuperAdmin: true },
      update: { isSuperAdmin: true },
    });
    console.log(`Super-admin : ${adminPhone}`);
  }
}

// ---------------------------------------------------------------- demo data

const DAY = 86_400_000;
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;

/** Simple product artwork (jar, bottle, bar, pouch) rendered to WebP in the uploads folder. */
async function productImage(name: string, kind: 'jar' | 'bottle' | 'bar' | 'pouch', c1: string, c2: string, label: string) {
  const dir = process.env.UPLOAD_DIR ?? 'uploads';
  mkdirSync(join(dir, 'demo'), { recursive: true });
  const shapes = {
    jar: `<rect x="250" y="300" width="300" height="320" rx="40" fill="${c1}"/><rect x="235" y="250" width="330" height="80" rx="20" fill="${c2}"/><rect x="290" y="400" width="220" height="120" rx="16" fill="#fff" opacity=".92"/>`,
    bottle: `<rect x="330" y="150" width="140" height="90" rx="14" fill="${c2}"/><path d="M300 260h200c30 0 50 30 50 60v300c0 30-20 50-50 50H300c-30 0-50-20-50-50V320c0-30 20-60 50-60z" fill="${c1}"/><rect x="285" y="400" width="230" height="130" rx="16" fill="#fff" opacity=".92"/>`,
    bar: `<rect x="200" y="330" width="400" height="230" rx="60" fill="${c1}"/><rect x="230" y="355" width="340" height="180" rx="45" fill="${c2}" opacity=".35"/><rect x="290" y="400" width="220" height="90" rx="14" fill="#fff" opacity=".92"/>`,
    pouch: `<path d="M260 220h280l30 420H230z" fill="${c1}"/><rect x="250" y="200" width="300" height="50" rx="10" fill="${c2}"/><rect x="290" y="400" width="220" height="120" rx="16" fill="#fff" opacity=".92"/>`,
  }[kind];
  const ty = kind === 'bar' ? 455 : kind === 'bottle' ? 478 : 470;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf6ec"/><stop offset="1" stop-color="${c2}" stop-opacity=".35"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/><ellipse cx="400" cy="660" rx="230" ry="26" fill="#000" opacity=".08"/>${shapes}
    <text x="400" y="${ty}" text-anchor="middle" font-family="DejaVu Sans, Arial" font-weight="700" font-size="34" fill="#2b2b2b">${label}</text></svg>`;
  const file = join(dir, 'demo', `${name}.webp`);
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(file);
  return `${(process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/uploads/demo/${name}.webp`;
}

/** Realistic activity for the demo store: products, 30 days of orders, courier, promo, payment. */
async function seedDemoActivity() {
  const store = await prisma.store.findUniqueOrThrow({ where: { slug: 'demo' }, include: { zones: true, couriers: true, products: true } });
  if ((await prisma.order.count({ where: { storeId: store.id } })) >= 10) return;
  const pro = await prisma.plan.findUniqueOrThrow({ where: { code: 'pro' } });

  // Courier Koffi signs in to the courier app with +225 01 01 01 01 01 / PIN 1234.
  let koffi = store.couriers[0]!;
  const koffiUser = await prisma.user.upsert({ where: { phone: koffi.phone }, create: { phone: koffi.phone, name: koffi.name }, update: {} });
  await prisma.storeMember.upsert({
    where: { storeId_userId: { storeId: store.id, userId: koffiUser.id } },
    create: { storeId: store.id, userId: koffiUser.id, role: 'COURIER' },
    update: {},
  });
  koffi = await prisma.courier.update({ where: { id: koffi.id }, data: { userId: koffiUser.id, pinHash: await argon2.hash('1234', { type: argon2.argon2id }) } });
  const moussa = await prisma.courier.upsert({
    where: { storeId_phone: { storeId: store.id, phone: '+2250505050505' } },
    create: { storeId: store.id, name: 'Moussa', phone: '+2250505050505', commission: 500 },
    update: {},
  });

  const karite = store.products[0]!;
  await prisma.product.update({ where: { id: karite.id }, data: { images: [await productImage('karite', 'jar', '#e9c46a', '#8a5a2b', 'KARITÉ')] } });
  const extra = [
    { title: 'Savon noir africain 200 g', slug: 'savon-noir-africain', code: 'demo456', price: 2500, compare: 3500, cost: 800, img: ['savon', 'bar', '#3d3027', '#7a6a58', 'SAVON NOIR'] as const },
    { title: 'Huile de coco vierge 500 ml', slug: 'huile-de-coco-vierge', code: 'demo789', price: 6000, compare: null, cost: 2500, img: ['coco', 'bottle', '#f1faee', '#2a9d8f', 'COCO'] as const },
    { title: 'Kit cheveux crépus (3 produits)', slug: 'kit-cheveux-crepus', code: 'demokit', price: 15000, compare: 19500, cost: 6000, img: ['kit', 'pouch', '#e76f51', '#264653', 'KIT CHEVEUX'] as const },
  ];
  const products = [karite];
  for (const e of extra) {
    const p = await prisma.product.upsert({
      where: { shortCode: e.code },
      create: {
        storeId: store.id, title: e.title, slug: e.slug, shortCode: e.code, price: e.price, compareAtPrice: e.compare, cost: e.cost, status: 'PUBLISHED',
        description: 'Produit naturel sélectionné par Boutique Démo. Livraison rapide, paiement à la livraison.',
        images: [await productImage(...e.img)],
      },
      update: {},
    });
    products.push(p);
  }

  const names = ['Aya Kouassi', 'Fatou Traoré', 'Mariam Koné', 'Adjoua N’Guessan', 'Awa Bamba', 'Salimata Diallo', 'Christelle Yao', 'Grâce Kouadio', 'Rokia Ouattara', 'Esther Aka', 'Nadège Gnagne', 'Bintou Sanogo', 'Prisca Amani', 'Djeneba Coulibaly', 'Ange Tanoh'];
  const sources = ['facebook', 'facebook', 'facebook', 'tiktok', 'tiktok', 'whatsapp', 'instagram', 'direct', 'manual'];
  const now = Date.now();
  const owner = await prisma.storeMember.findFirstOrThrow({ where: { storeId: store.id, role: 'OWNER' }, include: { user: true } });
  let seq = store.orderSeq;
  let koffiCash = 0;
  let moussaCash = 0;

  for (let i = 0; i < 72; i++) {
    const age = Math.floor(rand() * 30);
    const createdAt = new Date(now - age * DAY - Math.floor(rand() * 10) * 3_600_000);
    const product = rand() < 0.45 ? products[0]! : pick(products);
    const qty = rand() < 0.3 ? 2 : rand() < 0.1 ? 3 : 1;
    const unit = product.price;
    const subtotal = product.id === karite.id && qty === 2 ? 9000 : product.id === karite.id && qty === 3 ? 12000 : unit * qty;
    const zone = pick(store.zones);
    const fee = zone.freeAbove && subtotal >= zone.freeAbove ? 0 : zone.fee;
    const name = pick(names);
    const phone = `+22507${String(10_000_000 + Math.floor(rand() * 89_999_999)).slice(0, 8)}`;
    // Recent orders are still open; older ones went through the whole cycle.
    const r = rand();
    const status =
      age === 0 ? (r < 0.7 ? 'NEW' : 'CONFIRMED')
      : age <= 2 ? (r < 0.25 ? 'NEW' : r < 0.4 ? 'UNREACHABLE' : r < 0.6 ? 'CONFIRMED' : r < 0.85 ? 'SHIPPED' : 'DELIVERED')
      : r < 0.62 ? 'DELIVERED' : r < 0.72 ? 'REFUSED' : r < 0.84 ? 'CANCELLED' : r < 0.9 ? 'RETURNED' : r < 0.95 ? 'POSTPONED' : 'SHIPPED';
    const courier = ['SHIPPED', 'DELIVERED', 'REFUSED', 'RETURNED', 'POSTPONED'].includes(status) ? (rand() < 0.6 ? koffi : moussa) : null;
    const total = subtotal + fee;
    if (status === 'DELIVERED' && courier && age <= 1) {
      if (courier.id === koffi.id) koffiCash += total;
      else moussaCash += total;
    }
    const customer = await prisma.customer.upsert({
      where: { storeId_phone: { storeId: store.id, phone } },
      create: { storeId: store.id, phone, name, deliveredCount: status === 'DELIVERED' ? 1 : 0, refusedCount: status === 'REFUSED' ? 1 : 0 },
      update: {},
    });
    seq++;
    const events: { type: 'CREATED' | 'STATUS'; fromStatus?: string; toStatus: string; createdAt: Date; userName?: string }[] = [{ type: 'CREATED', toStatus: 'NEW', createdAt }];
    const path: Record<string, string[]> = {
      NEW: [], UNREACHABLE: ['UNREACHABLE'], CONFIRMED: ['CONFIRMED'], CANCELLED: ['CANCELLED'], SHIPPED: ['CONFIRMED', 'SHIPPED'],
      POSTPONED: ['CONFIRMED', 'SHIPPED', 'POSTPONED'], DELIVERED: ['CONFIRMED', 'SHIPPED', 'DELIVERED'], REFUSED: ['CONFIRMED', 'SHIPPED', 'REFUSED'], RETURNED: ['CONFIRMED', 'SHIPPED', 'REFUSED', 'RETURNED'],
    };
    let prev = 'NEW';
    path[status]!.forEach((to, k) => {
      events.push({ type: 'STATUS', fromStatus: prev, toStatus: to, createdAt: new Date(createdAt.getTime() + (k + 1) * 5 * 3_600_000), userName: ['DELIVERED', 'REFUSED', 'POSTPONED'].includes(to) ? courier?.name : owner.user.name });
      prev = to;
    });
    await prisma.order.create({
      data: {
        storeId: store.id, number: seq, trackingToken: randomBytes(12).toString('base64url'), customerId: customer.id, status: status as never, currency: 'XOF',
        subtotal, deliveryFee: fee, total, zoneId: zone.id, customerName: name, customerPhone: phone,
        city: zone.name === zone.city ? zone.city : `${zone.city} – ${zone.name}`, address: pick(['Derrière la pharmacie du marché', 'Près de l’école primaire', 'Carrefour Saint-Jean, immeuble bleu', 'Face à la station Total', 'Rue des jardins, portail vert']),
        source: pick(sources), courierId: courier?.id ?? null, createdAt, flags: rand() < 0.06 ? ['DUPLICATE'] : [],
        confirmedAt: status !== 'NEW' && status !== 'UNREACHABLE' && status !== 'CANCELLED' ? events[1]?.createdAt : null,
        deliveredAt: status === 'DELIVERED' ? events[events.length - 1]!.createdAt : null,
        refusalReason: status === 'REFUSED' || status === 'RETURNED' ? 'Client absent' : null,
        postponedTo: status === 'POSTPONED' ? new Date(now + DAY) : null,
        callAttempts: status === 'UNREACHABLE' ? 2 : status === 'NEW' ? 0 : 1,
        items: { create: { storeId: store.id, productId: product.id, title: product.title, quantity: qty, unitPrice: unit, total: subtotal } },
        events: { create: events.map((e) => ({ storeId: store.id, type: e.type, fromStatus: (e.fromStatus ?? null) as never, toStatus: e.toStatus as never, userName: e.userName ?? null, createdAt: e.createdAt })) },
      },
    });
  }
  await prisma.store.update({ where: { id: store.id }, data: { orderSeq: seq, referralCode: 'DEMO2026' } });
  await prisma.courier.update({ where: { id: koffi.id }, data: { cashBalance: koffiCash } });
  await prisma.courier.update({ where: { id: moussa.id }, data: { cashBalance: moussaCash } });

  // Marketing: a promo code and ad spend.
  await prisma.promoCode.upsert({
    where: { storeId_code: { storeId: store.id, code: 'BIENVENUE10' } },
    create: { storeId: store.id, code: 'BIENVENUE10', type: 'PERCENT', value: 10, usedCount: 7, usageLimit: 100 },
    update: {},
  });
  await prisma.promoCode.upsert({
    where: { storeId_code: { storeId: store.id, code: 'LIVRAISONOFFERTE' } },
    create: { storeId: store.id, code: 'LIVRAISONOFFERTE', type: 'FREE_SHIPPING', value: 0, minSubtotal: 10000, usedCount: 3 },
    update: {},
  });
  for (let w = 0; w < 4; w++) {
    await prisma.adSpend.create({ data: { storeId: store.id, day: new Date(new Date(now - w * 7 * DAY).toISOString().slice(0, 10)), channel: w % 2 ? 'tiktok' : 'facebook', amount: 15000 + w * 2500, note: 'Campagne karité' } });
  }

  // Billing: Pro paid by MTN MoMo this month, with its invoice.
  const startsAt = new Date(now - 6 * DAY);
  const sub = await prisma.subscription.create({ data: { storeId: store.id, planId: pro.id, status: 'ACTIVE', startsAt, endsAt: new Date(startsAt.getTime() + 30 * DAY), source: 'payment' } });
  const counter = await prisma.counter.upsert({ where: { key: 'invoice' }, create: { key: 'invoice', value: 1 }, update: { value: { increment: 1 } } });
  await prisma.payment.create({
    data: {
      storeId: store.id, planId: pro.id, subscriptionId: sub.id, amount: pro.price, currency: 'XOF', gateway: 'fedapay', reference: `PAY-DEMO-${counter.value}`,
      payerPhone: '+2250707070707', status: 'SUCCEEDED', paidAt: startsAt, invoiceNumber: counter.value, createdAt: startsAt,
    },
  });
  await prisma.store.update({ where: { id: store.id }, data: { planId: pro.id } });

  // A few other merchants for the back-office.
  const others = [
    { slug: 'mode-dakar', name: 'Mode Dakar', country: 'SN', phone: '+221771234567', owner: 'Ndeye Fall', plan: 'starter', days: 12 },
    { slug: 'tech-lome', name: 'Tech Lomé', country: 'TG', phone: '+22890123456', owner: 'Kodjo Mensah', plan: 'free', days: 3 },
    { slug: 'saveurs-cotonou', name: 'Saveurs de Cotonou', country: 'BJ', phone: '+2290196123456', owner: 'Rachidatou Adam', plan: 'pro', days: 1 },
  ];
  for (const o of others) {
    if (await prisma.store.findUnique({ where: { slug: o.slug } })) continue;
    const plan = await prisma.plan.findUniqueOrThrow({ where: { code: o.plan } });
    const user = await prisma.user.upsert({ where: { phone: o.phone }, create: { phone: o.phone, name: o.owner }, update: {} });
    const created = new Date(now - o.days * DAY);
    const st = await prisma.store.create({
      data: { name: o.name, slug: o.slug, country: o.country, currency: 'XOF', planId: plan.id, createdAt: created, members: { create: { userId: user.id, role: 'OWNER' } }, referredById: o.slug === 'saveurs-cotonou' ? store.id : null },
    });
    if (o.plan !== 'free') {
      await prisma.subscription.create({
        data: { storeId: st.id, planId: plan.id, status: o.plan === 'pro' ? 'TRIALING' : 'ACTIVE', startsAt: created, endsAt: new Date(created.getTime() + (o.plan === 'pro' ? 14 : 30) * DAY), source: o.plan === 'pro' ? 'trial' : 'payment' },
      });
    }
  }
  console.log('Activité démo : 72 commandes, 4 produits, livreur Koffi (PIN 1234), code BIENVENUE10, abonnement Pro payé');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
