import { HttpStatus, Injectable } from '@nestjs/common';
import { percent, type AdSpendInput, type OrderStatus, type StatsBreakdownRow, type StatsReport } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import type { StoreContext } from '../common/request';

const CONFIRMED: OrderStatus[] = ['CONFIRMED', 'SHIPPED', 'POSTPONED', 'DELIVERED', 'REFUSED', 'RETURNED'];
const SHIPPED: OrderStatus[] = ['SHIPPED', 'POSTPONED', 'DELIVERED', 'REFUSED', 'RETURNED'];
const SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', whatsapp: 'WhatsApp', google: 'Google', direct: 'Direct', manual: 'Téléphone', other: 'Autre',
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Merchant statistics (§8.3): rates, revenue, estimated profit and breakdowns. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  range(from?: string, to?: string) {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    if (start > end) throw new AppError('INVALID_RANGE', 'Période invalide');
    if (end.getTime() - start.getTime() > 366 * 86_400_000) throw new AppError('INVALID_RANGE', 'Période limitée à un an');
    return { start, end };
  }

  async report(ctx: StoreContext, from?: string, to?: string): Promise<StatsReport> {
    const { start, end } = this.range(from, to);
    const [orders, spends, agents] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId: ctx.storeId, createdAt: { gte: start, lte: end } },
        select: {
          id: true, status: true, total: true, subtotal: true, deliveryFee: true, discount: true, city: true, source: true, agentId: true, createdAt: true,
          courier: { select: { id: true, name: true, commission: true } },
          items: { select: { productId: true, title: true, quantity: true, total: true, product: { select: { cost: true } } } },
        },
      }),
      this.prisma.adSpend.findMany({ where: { storeId: ctx.storeId, day: { gte: start, lte: end } }, orderBy: { day: 'desc' } }),
      this.prisma.storeMember.findMany({ where: { storeId: ctx.storeId, role: { in: ['AGENT', 'OWNER', 'MANAGER'] } }, include: { user: { select: { id: true, name: true } } } }),
    ]);

    const is = (s: string, list: OrderStatus[]) => list.includes(s as OrderStatus);
    const rows = new Map<string, Map<string, StatsBreakdownRow & { shipped: number }>>();
    const bump = (dim: string, key: string, label: string, o: (typeof orders)[number], revenue = o.status === 'DELIVERED' ? o.total : 0) => {
      const m = rows.get(dim) ?? new Map();
      rows.set(dim, m);
      const r = m.get(key) ?? { key, label, orders: 0, confirmed: 0, delivered: 0, refused: 0, revenue: 0, confirmationRate: null, deliveryRate: null, shipped: 0 };
      r.orders++;
      if (is(o.status, CONFIRMED)) r.confirmed++;
      if (is(o.status, SHIPPED)) r.shipped++;
      if (o.status === 'DELIVERED') r.delivered++;
      if (o.status === 'REFUSED' || o.status === 'RETURNED') r.refused++;
      r.revenue += revenue;
      m.set(key, r);
    };
    const agentName = new Map(agents.map((a) => [a.user.id, a.user.name]));

    let productCost = 0;
    let courierCommissions = 0;
    const daily = new Map<string, { day: string; orders: number; delivered: number; revenue: number }>();
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) daily.set(dayKey(d), { day: dayKey(d), orders: 0, delivered: 0, revenue: 0 });

    for (const o of orders) {
      const delivered = o.status === 'DELIVERED';
      const day = daily.get(dayKey(o.createdAt));
      if (day) {
        day.orders++;
        if (delivered) {
          day.delivered++;
          day.revenue += o.total;
        }
      }
      if (delivered) {
        productCost += o.items.reduce((s, i) => s + (i.product.cost ?? 0) * i.quantity, 0);
        courierCommissions += o.courier?.commission ?? 0;
      }
      for (const i of o.items) bump('product', i.productId, i.title, o, delivered ? i.total : 0);
      bump('city', o.city, o.city, o);
      bump('source', o.source ?? 'direct', SOURCE_LABELS[o.source ?? 'direct'] ?? o.source ?? 'Direct', o);
      if (o.courier) bump('courier', o.courier.id, o.courier.name, o);
      if (o.agentId) bump('agent', o.agentId, agentName.get(o.agentId) ?? 'Agent', o);
    }

    const list = (dim: string): StatsBreakdownRow[] =>
      [...(rows.get(dim)?.values() ?? [])]
        .map(({ shipped, ...r }) => ({ ...r, confirmationRate: percent(r.confirmed, r.orders), deliveryRate: percent(r.delivered, shipped) }))
        .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders)
        .slice(0, 50);

    const count = (pred: (s: string) => boolean) => orders.filter((o) => pred(o.status)).length;
    const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED');
    const revenue = deliveredOrders.reduce((s, o) => s + o.total, 0);
    const adSpend = spends.reduce((s, a) => s + a.amount, 0);
    const confirmed = count((s) => is(s, CONFIRMED));
    const shipped = count((s) => is(s, SHIPPED));

    return {
      currency: ctx.currency,
      from: dayKey(start),
      to: dayKey(end),
      totals: {
        orders: orders.length,
        confirmed,
        shipped,
        delivered: deliveredOrders.length,
        refused: count((s) => s === 'REFUSED' || s === 'RETURNED'),
        cancelled: count((s) => s === 'CANCELLED'),
        confirmationRate: percent(confirmed, orders.length),
        deliveryRate: percent(deliveredOrders.length, shipped),
        revenue,
        productCost,
        deliveryFees: deliveredOrders.reduce((s, o) => s + o.deliveryFee, 0),
        discounts: deliveredOrders.reduce((s, o) => s + o.discount, 0),
        courierCommissions,
        adSpend,
        profit: revenue - productCost - courierCommissions - adSpend,
        averageBasket: deliveredOrders.length ? Math.round(revenue / deliveredOrders.length) : null,
      },
      daily: [...daily.values()],
      byProduct: list('product'),
      byCity: list('city'),
      byCourier: list('courier'),
      byAgent: list('agent'),
      bySource: list('source'),
      adSpends: spends.map((a) => ({ id: a.id, day: dayKey(a.day), channel: a.channel, amount: a.amount, note: a.note })),
    };
  }

  async addSpend(ctx: StoreContext, input: AdSpendInput) {
    const a = await this.prisma.adSpend.create({ data: { storeId: ctx.storeId, day: new Date(`${input.day}T00:00:00.000Z`), channel: input.channel, amount: input.amount, note: input.note } });
    return { id: a.id, day: dayKey(a.day), channel: a.channel, amount: a.amount, note: a.note };
  }

  async removeSpend(ctx: StoreContext, id: string) {
    const res = await this.prisma.adSpend.deleteMany({ where: { id, storeId: ctx.storeId } });
    if (res.count === 0) throw new AppError('NOT_FOUND', 'Dépense introuvable', HttpStatus.NOT_FOUND);
  }

  /** Orders of the period as CSV (Excel-friendly: semicolons, BOM). */
  async ordersCsv(ctx: StoreContext, from?: string, to?: string): Promise<string> {
    const { start, end } = this.range(from, to);
    const orders = await this.prisma.order.findMany({
      where: { storeId: ctx.storeId, createdAt: { gte: start, lte: end } },
      include: { items: true, courier: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Numéro', 'Date', 'Statut', 'Client', 'Téléphone', 'Ville', 'Adresse', 'Articles', 'Sous-total', 'Livraison', 'Remise', 'Code promo', 'Total', 'Source', 'Livreur'];
    const lines = orders.map((o) =>
      [
        o.number, o.createdAt.toISOString(), o.status, o.customerName, o.customerPhone, o.city, o.address,
        o.items.map((i) => `${i.quantity} x ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`).join(' | '),
        o.subtotal, o.deliveryFee, o.discount, o.promoCode, o.total, o.source, o.courier?.name,
      ].map(esc).join(';'),
    );
    return `﻿${[header.join(';'), ...lines].join('\n')}\n`;
  }
}
