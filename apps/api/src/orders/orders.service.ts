import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Order, type Store } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  OVER_LIMIT_FLAG,
  promoDiscount,
  AGENT_STATUSES,
  COURIER_STATUSES,
  EDITABLE_ORDER_STATUSES,
  canTransition,
  deliveryFeeFor,
  formatMoney,
  normalizePhone,
  priceForQuantity,
  roleHas,
  type BulkOrderActionInput,
  type ManualOrderInput,
  type OrderAssignInput,
  type OrderCounts,
  type OrderDetailDto,
  type OrderListQuery,
  type OrderStatus,
  type OrderStatusChangeInput,
  type OrderSummaryDto,
  type OrderUpdateInput,
  type Paginated,
  type PublicOrderCreated,
  type PublicOrderInput,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { trackingUrl } from '../common/config';
import type { AuthUser, StoreContext } from '../common/request';
import { MessagingService } from '../notifications/messaging.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { orderDetailInclude, orderSummaryInclude, toOrderDetail, toOrderSummary } from './order.mapper';
import { PromosService } from '../promos/promos.service';
import { PlansService } from '../billing/plans.service';
import { IntegrationsService } from '../integrations/integrations.service';

type Tx = Prisma.TransactionClient;

/** Statuses during which the ordered quantity is taken out of stock (decrement on confirmation, §5.2). */
const STOCK_HELD: readonly OrderStatus[] = ['CONFIRMED', 'SHIPPED', 'POSTPONED', 'DELIVERED', 'REFUSED'];

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OrderMeta {
  ip?: string;
  actor?: AuthUser;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly realtime: RealtimeGateway,
    private readonly promos: PromosService,
    private readonly plans: PlansService,
    private readonly integrations: IntegrationsService,
  ) {}

  // ------------------------------------------------------------------ creation

  /** Customer checkout from a storefront or product link (parcours B). */
  async createPublic(storeId: string, input: PublicOrderInput, meta: OrderMeta = {}): Promise<PublicOrderCreated> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Boutique introuvable', HttpStatus.NOT_FOUND);
    if (store.status !== 'ACTIVE') {
      throw new AppError('STORE_CLOSED', store.closedMessage ?? 'La boutique est temporairement fermée');
    }
    const order = await this.createOrder(store, input, meta);
    return {
      orderId: order.id,
      number: order.number,
      trackingToken: order.trackingToken,
      total: order.total,
      currency: order.currency,
    };
  }

  /** Order taken by phone and typed in by the merchant (§6.1). */
  async createManual(ctx: StoreContext, user: AuthUser, input: ManualOrderInput): Promise<OrderDetailDto> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    const order = await this.createOrder(store, input, { actor: user }, { allowDraftProduct: true });
    return this.get(ctx, order.id);
  }

  private async createOrder(
    store: Store,
    input: PublicOrderInput,
    meta: OrderMeta,
    opts: { allowDraftProduct?: boolean } = {},
  ): Promise<Order> {
    const phone = normalizePhone(input.customerPhone, store.country);
    if (!phone) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide');

    const product = await this.prisma.product.findFirst({
      where: {
        id: input.productId,
        storeId: store.id,
        status: opts.allowDraftProduct ? { not: 'ARCHIVED' } : 'PUBLISHED',
      },
      include: { variants: true, quantityOffers: true },
    });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Produit indisponible', HttpStatus.NOT_FOUND);

    let variant: (typeof product.variants)[number] | undefined;
    if (product.variants.length > 0) {
      variant = product.variants.find((v) => v.id === input.variantId);
      if (!variant) throw new AppError('VARIANT_REQUIRED', 'Choisissez une variante');
    }
    if (product.trackStock) {
      const available = variant ? variant.stock : product.stock;
      if (available != null && available < input.quantity) {
        throw new AppError('OUT_OF_STOCK', 'Stock insuffisant', HttpStatus.CONFLICT, { available });
      }
    }

    const flags: string[] = [];
    let zone: { id: string; name: string; city: string; fee: number; freeAbove: number | null } | null = null;
    let city: string;
    if (input.zoneId === 'OTHER') {
      if (store.blockUnservedZones) throw new AppError('ZONE_NOT_SERVED', 'Nous ne livrons pas encore cette zone');
      if (!input.city || input.city.length < 2) throw new AppError('CITY_REQUIRED', 'Indiquez votre ville');
      city = input.city;
      flags.push('UNSERVED_ZONE');
    } else {
      zone = await this.prisma.deliveryZone.findFirst({ where: { id: input.zoneId, storeId: store.id, active: true } });
      if (!zone) throw new AppError('ZONE_NOT_FOUND', 'Zone de livraison invalide');
      city = zone.name === zone.city ? zone.city : `${zone.city} – ${zone.name}`;
    }

    // Anti-fraud (§6.3): blacklist, per-day limit, duplicates, customer score.
    const existingCustomer = await this.prisma.customer.findUnique({
      where: { storeId_phone: { storeId: store.id, phone: phone.e164 } },
    });
    if (existingCustomer?.blacklisted && !meta.actor) {
      throw new AppError('ORDER_REJECTED', "Votre commande n'a pas pu être enregistrée", HttpStatus.FORBIDDEN);
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    if (!meta.actor) {
      const today = await this.prisma.order.count({
        where: { storeId: store.id, customerPhone: phone.e164, createdAt: { gte: startOfDay } },
      });
      if (today >= store.maxOrdersPerPhonePerDay) {
        throw new AppError('ORDER_LIMIT', 'Nombre maximum de commandes atteint pour aujourd’hui', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    const duplicate = await this.prisma.order.findFirst({
      where: {
        storeId: store.id,
        customerPhone: phone.e164,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
        items: { some: { productId: product.id } },
      },
      select: { id: true },
    });
    if (duplicate) flags.push('DUPLICATE');
    if (existingCustomer && existingCustomer.refusedCount >= 2 && existingCustomer.refusedCount > existingCustomer.deliveredCount) {
      flags.push('LOW_SCORE');
    }
    if (existingCustomer?.blacklisted) flags.push('BLACKLISTED');

    const unitPrice = variant?.price ?? product.price;
    const lineTotal = priceForQuantity(unitPrice, input.quantity, product.quantityOffers);
    const subtotal = lineTotal;
    const deliveryFee = zone ? deliveryFeeFor(zone, subtotal) : 0;
    const promo = input.promoCode ? await this.promos.findUsable(store.id, input.promoCode, subtotal) : null;
    const discount = promo ? promoDiscount(promo, subtotal, deliveryFee) : 0;
    const total = subtotal + deliveryFee - discount;

    // Plan quota (§9.1): the order is never lost, but it stays locked until the merchant upgrades.
    if (await this.plans.ordersQuotaReached(store.id)) flags.push(OVER_LIMIT_FLAG);

    const agentUserId = await this.pickAgent(store.id);

    const order = await this.prisma.$transaction(async (tx) => {
      if (promo) await this.promos.consume(tx, promo.id);
      const customer = await tx.customer.upsert({
        where: { storeId_phone: { storeId: store.id, phone: phone.e164 } },
        create: { storeId: store.id, phone: phone.e164, name: input.customerName },
        update: { name: input.customerName },
      });
      const { orderSeq } = await tx.store.update({
        where: { id: store.id },
        data: { orderSeq: { increment: 1 } },
        select: { orderSeq: true },
      });
      return tx.order.create({
        data: {
          storeId: store.id,
          number: orderSeq,
          trackingToken: randomBytes(12).toString('base64url'),
          customerId: customer.id,
          currency: store.currency,
          subtotal,
          deliveryFee,
          discount,
          promoCode: promo?.code ?? null,
          total,
          zoneId: zone?.id ?? null,
          customerName: input.customerName,
          customerPhone: phone.e164,
          city,
          address: input.address,
          gpsLat: input.gps?.lat ?? null,
          gpsLng: input.gps?.lng ?? null,
          note: input.note ?? null,
          source: input.source ?? 'direct',
          utm: input.utm ?? undefined,
          flags,
          agentId: agentUserId,
          items: {
            create: {
              storeId: store.id,
              productId: product.id,
              variantId: variant?.id ?? null,
              title: product.title,
              variantTitle: variant?.title ?? null,
              quantity: input.quantity,
              unitPrice,
              total: lineTotal,
            },
          },
          events: {
            create: {
              storeId: store.id,
              type: 'CREATED',
              toStatus: 'NEW',
              userId: meta.actor?.id ?? null,
              userName: meta.actor?.name ?? null,
              note: meta.actor ? 'Commande saisie manuellement' : null,
            },
          },
        },
        include: orderSummaryInclude,
      });
    });

    const summary = toOrderSummary(order);
    this.realtime.emitOrderCreated(store.id, summary, agentUserId);
    void this.notifyCustomer(store, order, 'created');
    void this.pushToSheets(store.id, order.id, 'order.created');
    return order;
  }

  /** Google Sheets sync (§8.4), queued; never blocks or fails the order flow. */
  private async pushToSheets(storeId: string, orderId: string, event: 'order.created' | 'order.updated') {
    try {
      const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, courier: { select: { name: true } } } });
      await this.integrations.pushOrder({
        event,
        storeId,
        order: {
          number: o.number,
          date: o.createdAt.toISOString(),
          status: o.status,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          city: o.city,
          address: o.address,
          items: o.items.map((i) => `${i.quantity} × ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ''}`).join(', '),
          subtotal: o.subtotal,
          deliveryFee: o.deliveryFee,
          discount: o.discount,
          total: o.total,
          currency: o.currency,
          source: o.source,
          courier: o.courier?.name ?? null,
          note: o.note,
        },
      });
    } catch (e) {
      this.logger.warn(`Sheets push failed: ${(e as Error).message}`);
    }
  }

  /** Spreads new orders across confirmation agents: the one with the fewest open orders wins (§6.2). */
  private async pickAgent(storeId: string): Promise<string | null> {
    const agents = await this.prisma.storeMember.findMany({ where: { storeId, role: 'AGENT' }, select: { userId: true } });
    if (agents.length === 0) return null;
    const loads = await this.prisma.order.groupBy({
      by: ['agentId'],
      where: { storeId, status: { in: ['NEW', 'UNREACHABLE'] }, agentId: { in: agents.map((a) => a.userId) } },
      _count: { _all: true },
    });
    const load = new Map(loads.map((l) => [l.agentId, l._count._all]));
    return agents.map((a) => a.userId).sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0] ?? null;
  }

  private async notifyCustomer(store: Store, order: Order, event: 'created' | 'confirmed' | 'shipped') {
    try {
      const en = store.locale === 'en';
      const link = trackingUrl(order.trackingToken);
      const total = formatMoney(order.total, order.currency, store.locale);
      const text = {
        created: en
          ? `${store.name}: order #${order.number} received (${total}, cash on delivery). Track it: ${link}`
          : `${store.name} : commande n°${order.number} reçue (${total}, paiement à la livraison). Suivi : ${link}`,
        confirmed: en
          ? `${store.name}: your order #${order.number} is confirmed. Track it: ${link}`
          : `${store.name} : votre commande n°${order.number} est confirmée. Suivi : ${link}`,
        shipped: en
          ? `${store.name}: your order #${order.number} is on its way. Please keep ${total} ready. ${link}`
          : `${store.name} : votre commande n°${order.number} est en route. Prévoyez ${total}. ${link}`,
      }[event];
      await this.messaging.send({ channel: 'sms', to: order.customerPhone, text });
    } catch (e) {
      this.logger.warn(`Customer notification failed: ${(e as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ reading

  private scopeWhere(ctx: StoreContext, user: AuthUser): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { storeId: ctx.storeId };
    if (!roleHas(ctx.role, 'orders.read.all')) {
      if (roleHas(ctx.role, 'orders.read.assigned')) where.agentId = user.id;
      else if (ctx.role === 'COURIER') where.courierId = ctx.courierId ?? '__none__';
      else where.id = '__none__';
    }
    return where;
  }

  async list(ctx: StoreContext, user: AuthUser, q: OrderListQuery): Promise<Paginated<OrderSummaryDto>> {
    const where: Prisma.OrderWhereInput = {
      ...this.scopeWhere(ctx, user),
      ...(q.status ? { status: q.status } : {}),
      ...(q.zoneId ? { zoneId: q.zoneId } : {}),
      ...(q.courierId ? { courierId: q.courierId } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.productId ? { items: { some: { productId: q.productId } } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    if (q.q) {
      const n = Number(q.q.replace(/^#/, ''));
      where.OR = [
        { customerName: { contains: q.q, mode: 'insensitive' } },
        { customerPhone: { contains: q.q.replace(/\s/g, '') } },
        { city: { contains: q.q, mode: 'insensitive' } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ];
    }
    const rows = await this.prisma.order.findMany({
      where,
      include: orderSummaryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map(toOrderSummary);
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async counts(ctx: StoreContext, user: AuthUser): Promise<OrderCounts> {
    const base = this.scopeWhere(ctx, user);
    const grouped = await this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } });
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await this.prisma.order.count({ where: { ...base, createdAt: { gte: startOfDay } } });
    return { byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])), today };
  }

  private async findScoped(ctx: StoreContext, user: AuthUser, id: string) {
    const order = await this.prisma.order.findFirst({ where: { ...this.scopeWhere(ctx, user), id }, include: orderDetailInclude });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable', HttpStatus.NOT_FOUND);
    return order;
  }

  async get(ctx: StoreContext, id: string, user?: AuthUser): Promise<OrderDetailDto> {
    const order = user
      ? await this.findScoped(ctx, user, id)
      : await this.prisma.order.findFirstOrThrow({ where: { id, storeId: ctx.storeId }, include: orderDetailInclude });
    return toOrderDetail(order, { name: ctx.name, locale: ctx.locale });
  }

  // ------------------------------------------------------------------ status workflow

  async changeStatus(
    ctx: StoreContext,
    user: AuthUser,
    id: string,
    input: OrderStatusChangeInput,
    opts: { clientActionId?: string } = {},
  ): Promise<OrderDetailDto> {
    const order = await this.findScoped(ctx, user, id);
    const from = order.status as OrderStatus;
    const to = input.status;

    if (order.flags.includes(OVER_LIMIT_FLAG)) {
      throw new AppError('ORDER_OVER_LIMIT', 'Limite de commandes du plan atteinte : passez au plan supérieur pour traiter cette commande', HttpStatus.PAYMENT_REQUIRED);
    }

    if (ctx.role === 'AGENT' && !AGENT_STATUSES.includes(to)) {
      throw new AppError('FORBIDDEN', 'Votre rôle ne permet pas ce statut', HttpStatus.FORBIDDEN);
    }
    if (ctx.role === 'COURIER' && !COURIER_STATUSES.includes(to)) {
      throw new AppError('FORBIDDEN', 'Votre rôle ne permet pas ce statut', HttpStatus.FORBIDDEN);
    }
    if (!canTransition(from, to)) {
      throw new AppError('INVALID_TRANSITION', `Passage de ${from} à ${to} impossible`, HttpStatus.CONFLICT);
    }
    if (to === 'SHIPPED' && !order.courierId) throw new AppError('COURIER_REQUIRED', 'Assignez d’abord un livreur');
    if (to === 'REFUSED' && !input.reason) throw new AppError('REASON_REQUIRED', 'Indiquez le motif du refus');
    if (to === 'POSTPONED' && !input.postponedTo) throw new AppError('DATE_REQUIRED', 'Indiquez la nouvelle date');

    await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the status must not have changed since we read it.
      const res = await tx.order.updateMany({
        where: { id: order.id, storeId: ctx.storeId, status: from },
        data: {
          status: to,
          ...(to === 'CONFIRMED' && !order.confirmedAt ? { confirmedAt: new Date() } : {}),
          ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(to === 'UNREACHABLE' ? { callAttempts: { increment: 1 } } : {}),
          ...(to === 'REFUSED' ? { refusalReason: input.reason } : {}),
          ...(to === 'POSTPONED' ? { postponedTo: new Date(input.postponedTo!) } : {}),
        },
      });
      if (res.count === 0) throw new AppError('CONFLICT', 'La commande a été modifiée entre-temps', HttpStatus.CONFLICT);

      const held = (s: OrderStatus) => STOCK_HELD.includes(s);
      if (!held(from) && held(to)) await this.adjustStock(tx, ctx.storeId, order.id, -1);
      if (held(from) && !held(to)) await this.adjustStock(tx, ctx.storeId, order.id, +1);

      if (to === 'DELIVERED') {
        await tx.customer.update({ where: { id: order.customerId }, data: { deliveredCount: { increment: 1 } } });
        if (order.courierId) {
          // The courier now owes the collected cash to the merchant (§6.5).
          await tx.courier.update({ where: { id: order.courierId }, data: { cashBalance: { increment: order.total } } });
        }
      }
      if (to === 'REFUSED') {
        await tx.customer.update({ where: { id: order.customerId }, data: { refusedCount: { increment: 1 } } });
      }

      const note = [input.reason, input.note].filter(Boolean).join(' — ') || null;
      await tx.orderEvent.create({
        data: {
          storeId: ctx.storeId, orderId: order.id, type: 'STATUS', fromStatus: from, toStatus: to, userId: user.id, userName: user.name, note,
          clientActionId: opts.clientActionId ?? null,
        },
      });
    });

    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    if (to === 'CONFIRMED' && from !== 'CONFIRMED') void this.notifyCustomer(store, order, 'confirmed');
    if (to === 'SHIPPED') void this.notifyCustomer(store, order, 'shipped');

    const detail = await this.get(ctx, order.id);
    this.realtime.emitOrderUpdated(ctx.storeId, detail);
    void this.pushToSheets(ctx.storeId, order.id, 'order.updated');
    return detail;
  }

  /** direction -1 takes items out of stock, +1 puts them back. */
  private async adjustStock(tx: Tx, storeId: string, orderId: string, direction: 1 | -1) {
    const items = await tx.orderItem.findMany({ where: { orderId, storeId }, include: { product: true } });
    for (const item of items) {
      if (!item.product.trackStock) continue;
      const delta = direction * item.quantity;
      if (item.variantId) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (v?.stock == null) continue;
        if (direction < 0 && v.stock < item.quantity) {
          throw new AppError('OUT_OF_STOCK', `Stock insuffisant pour ${item.title} (${v.title})`, HttpStatus.CONFLICT);
        }
        await tx.productVariant.update({ where: { id: v.id }, data: { stock: { increment: delta } } });
      } else {
        if (item.product.stock == null) continue;
        if (direction < 0 && item.product.stock < item.quantity) {
          throw new AppError('OUT_OF_STOCK', `Stock insuffisant pour ${item.title}`, HttpStatus.CONFLICT);
        }
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: delta } } });
      }
    }
  }

  async assign(ctx: StoreContext, user: AuthUser, id: string, input: OrderAssignInput): Promise<OrderDetailDto> {
    const order = await this.findScoped(ctx, user, id);
    let courierName: string | null = null;
    let courierUserId: string | null = null;
    if (input.courierId) {
      const courier = await this.prisma.courier.findFirst({ where: { id: input.courierId, storeId: ctx.storeId, active: true } });
      if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Livreur introuvable', HttpStatus.NOT_FOUND);
      if (!['NEW', 'UNREACHABLE', 'CONFIRMED', 'SHIPPED', 'POSTPONED'].includes(order.status)) {
        throw new AppError('INVALID_TRANSITION', 'Cette commande ne peut plus être assignée', HttpStatus.CONFLICT);
      }
      courierName = courier.name;
      courierUserId = courier.userId;
    }
    if (input.agentId) {
      const agent = await this.prisma.storeMember.findFirst({ where: { storeId: ctx.storeId, userId: input.agentId, role: 'AGENT' } });
      if (!agent) throw new AppError('AGENT_NOT_FOUND', 'Agent introuvable', HttpStatus.NOT_FOUND);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          ...(input.courierId !== undefined ? { courierId: input.courierId } : {}),
          ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
        },
      });
      await tx.orderEvent.create({
        data: {
          storeId: ctx.storeId,
          orderId: order.id,
          type: 'ASSIGN',
          userId: user.id,
          userName: user.name,
          note: input.courierId !== undefined ? (courierName ? `Livreur : ${courierName}` : 'Livreur retiré') : 'Agent modifié',
        },
      });
    });
    // Assigning a courier to a confirmed order hands it over for delivery (parcours C, étape 3).
    if (input.courierId && order.status === 'CONFIRMED') {
      const detail = await this.changeStatus(ctx, user, order.id, { status: 'SHIPPED' });
      if (courierUserId) this.realtime.emitToCourierUser(ctx.storeId, courierUserId, 'delivery.assigned', detail);
      return detail;
    }
    const detail = await this.get(ctx, order.id);
    if (courierUserId) this.realtime.emitToCourierUser(ctx.storeId, courierUserId, 'delivery.assigned', detail);
    this.realtime.emitOrderUpdated(ctx.storeId, detail);
    return detail;
  }

  async addNote(ctx: StoreContext, user: AuthUser, id: string, note: string): Promise<OrderDetailDto> {
    const order = await this.findScoped(ctx, user, id);
    await this.prisma.orderEvent.create({
      data: { storeId: ctx.storeId, orderId: order.id, type: 'NOTE', userId: user.id, userName: user.name, note },
    });
    return this.get(ctx, order.id);
  }

  /** Logs a call or WhatsApp attempt from the one-click buttons. */
  async logContact(ctx: StoreContext, user: AuthUser, id: string, channel: 'CALL' | 'WHATSAPP'): Promise<OrderDetailDto> {
    const order = await this.findScoped(ctx, user, id);
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: channel === 'CALL' ? { callAttempts: { increment: 1 } } : {} }),
      this.prisma.orderEvent.create({
        data: { storeId: ctx.storeId, orderId: order.id, type: channel, userId: user.id, userName: user.name },
      }),
    ]);
    return this.get(ctx, order.id);
  }

  /** Edit before shipping: customer details, zone, quantities, variants (§6.1). */
  async update(ctx: StoreContext, user: AuthUser, id: string, input: OrderUpdateInput): Promise<OrderDetailDto> {
    const order = await this.findScoped(ctx, user, id);
    if (!EDITABLE_ORDER_STATUSES.includes(order.status as OrderStatus)) {
      throw new AppError('ORDER_LOCKED', 'Commande déjà expédiée : modification impossible', HttpStatus.CONFLICT);
    }
    if (order.status === 'CONFIRMED' && input.items) {
      throw new AppError('ORDER_LOCKED', 'Repassez la commande en « Nouvelle » pour modifier les articles', HttpStatus.CONFLICT);
    }
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    const data: Prisma.OrderUpdateInput = {};
    const changes: string[] = [];

    if (input.customerName) {
      data.customerName = input.customerName;
      changes.push('nom');
    }
    if (input.customerPhone) {
      const phone = normalizePhone(input.customerPhone, store.country);
      if (!phone) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide');
      data.customerPhone = phone.e164;
      changes.push('téléphone');
    }
    if (input.address) {
      data.address = input.address;
      changes.push('adresse');
    }
    if (input.note !== undefined) data.note = input.note;

    await this.prisma.$transaction(async (tx) => {
      let subtotal = order.subtotal;
      if (input.items) {
        subtotal = 0;
        for (const change of input.items) {
          const item = order.items.find((i) => i.id === change.id);
          if (!item) throw new AppError('ITEM_NOT_FOUND', 'Ligne de commande introuvable', HttpStatus.NOT_FOUND);
          const product = await tx.product.findFirstOrThrow({
            where: { id: item.productId, storeId: ctx.storeId },
            include: { variants: true, quantityOffers: true },
          });
          const variantId = change.variantId !== undefined ? change.variantId : item.variantId;
          const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
          if (variantId && !variant) throw new AppError('VARIANT_NOT_FOUND', 'Variante introuvable');
          const unitPrice = variant?.price ?? product.price;
          const total = priceForQuantity(unitPrice, change.quantity, product.quantityOffers);
          await tx.orderItem.update({
            where: { id: item.id },
            data: { quantity: change.quantity, variantId: variant?.id ?? null, variantTitle: variant?.title ?? null, unitPrice, total },
          });
        }
        const items = await tx.orderItem.findMany({ where: { orderId: order.id, storeId: ctx.storeId } });
        subtotal = items.reduce((s, i) => s + i.total, 0);
        changes.push('articles');
      }
      let zone = order.zone;
      if (input.zoneId && input.zoneId !== order.zoneId) {
        zone = await tx.deliveryZone.findFirst({ where: { id: input.zoneId, storeId: ctx.storeId } });
        if (!zone) throw new AppError('ZONE_NOT_FOUND', 'Zone de livraison invalide');
        data.zone = { connect: { id: zone.id } };
        data.city = zone.name === zone.city ? zone.city : `${zone.city} – ${zone.name}`;
        changes.push('zone');
      }
      const deliveryFee = zone ? deliveryFeeFor(zone, subtotal) : order.deliveryFee;
      // The promo code stays attached; its discount follows the new basket.
      const promo = order.promoCode
        ? await tx.promoCode.findUnique({ where: { storeId_code: { storeId: ctx.storeId, code: order.promoCode } } })
        : null;
      const discount = promo ? promoDiscount(promo, subtotal, deliveryFee) : 0;
      data.subtotal = subtotal;
      data.deliveryFee = deliveryFee;
      data.discount = discount;
      data.total = subtotal + deliveryFee - discount;
      await tx.order.update({ where: { id: order.id }, data });
      if (changes.length) {
        await tx.orderEvent.create({
          data: { storeId: ctx.storeId, orderId: order.id, type: 'EDIT', userId: user.id, userName: user.name, note: `Modifié : ${changes.join(', ')}` },
        });
      }
    });
    const detail = await this.get(ctx, order.id);
    this.realtime.emitOrderUpdated(ctx.storeId, detail);
    return detail;
  }

  async bulk(ctx: StoreContext, user: AuthUser, input: BulkOrderActionInput) {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of input.orderIds) {
      try {
        if (input.action === 'confirm') await this.changeStatus(ctx, user, id, { status: 'CONFIRMED' });
        else await this.assign(ctx, user, id, { courierId: input.courierId ?? null });
        results.push({ id, ok: true });
      } catch (e) {
        const response = e instanceof AppError ? (e.getResponse() as { code?: string }) : undefined;
        results.push({ id, ok: false, error: response?.code ?? 'ERROR' });
      }
    }
    return { results };
  }

  async setBlacklist(ctx: StoreContext, user: AuthUser, orderId: string, blacklisted: boolean) {
    const order = await this.findScoped(ctx, user, orderId);
    await this.prisma.customer.update({ where: { id: order.customerId }, data: { blacklisted } });
    await this.prisma.auditLog.create({
      data: { storeId: ctx.storeId, actorId: user.id, action: blacklisted ? 'customer.blacklist' : 'customer.unblacklist', target: order.customerId },
    });
    return this.get(ctx, order.id);
  }
}
