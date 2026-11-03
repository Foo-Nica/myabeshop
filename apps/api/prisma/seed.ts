/**
 * Seeds subscription plans (cahier des charges §9.1, prix indicatifs) and, with SEED_DEMO=true,
 * a demo store with products, zones and a courier.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
