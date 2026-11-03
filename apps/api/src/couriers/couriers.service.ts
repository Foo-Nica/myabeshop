import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import {
  normalizePhone,
  type CourierDeliveriesResponse,
  type CourierDto,
  type CourierInput,
  type DeliverySyncInput,
  type DeliverySyncResult,
  type RemittanceInput,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import type { AuthUser, StoreContext } from '../common/request';
import { PlansService } from '../billing/plans.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class CouriersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly orders: OrdersService,
  ) {}

  async list(ctx: StoreContext): Promise<CourierDto[]> {
    const couriers = await this.prisma.courier.findMany({
      where: { storeId: ctx.storeId },
      include: { _count: { select: { orders: { where: { status: { in: ['SHIPPED', 'POSTPONED'] } } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return couriers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      commission: c.commission,
      cashBalance: c.cashBalance,
      active: c.active,
      activeDeliveries: c._count.orders,
      hasPin: !!c.pinHash,
    }));
  }

  /**
   * Creates a courier and gives them a COURIER membership so they can sign in with their
   * phone number and see only their own deliveries.
   */
  async create(ctx: StoreContext, actor: AuthUser, input: CourierInput): Promise<CourierDto> {
    await this.plans.assertFeature(ctx.storeId, 'couriers');
    const phone = normalizePhone(input.phone, ctx.country);
    if (!phone) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide pour ce pays');
    const exists = await this.prisma.courier.findUnique({ where: { storeId_phone: { storeId: ctx.storeId, phone: phone.e164 } } });
    if (exists) throw new AppError('COURIER_EXISTS', 'Ce livreur existe déjà', HttpStatus.CONFLICT);

    const courier = await this.prisma.$transaction(async (tx) => {
      const user =
        (await tx.user.findUnique({ where: { phone: phone.e164 } })) ??
        (await tx.user.create({ data: { phone: phone.e164, name: input.name } }));
      const membership = await tx.storeMember.findUnique({ where: { storeId_userId: { storeId: ctx.storeId, userId: user.id } } });
      if (!membership) await tx.storeMember.create({ data: { storeId: ctx.storeId, userId: user.id, role: 'COURIER' } });
      return tx.courier.create({
        data: { storeId: ctx.storeId, userId: user.id, name: input.name, phone: phone.e164, commission: input.commission, active: input.active },
      });
    });
    await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'courier.create', target: courier.id } });
    return { ...courier, activeDeliveries: 0, hasPin: false };
  }

  async update(ctx: StoreContext, id: string, input: Partial<CourierInput>): Promise<CourierDto> {
    const courier = await this.prisma.courier.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Livreur introuvable', HttpStatus.NOT_FOUND);
    const { phone: _ignored, ...rest } = input;
    await this.prisma.courier.update({ where: { id }, data: rest });
    return (await this.list(ctx)).find((c) => c.id === id)!;
  }

  /** Cash handed over by a courier: lowers the balance they owe (§6.5). */
  async remit(ctx: StoreContext, actor: AuthUser, id: string, input: RemittanceInput) {
    const courier = await this.prisma.courier.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Livreur introuvable', HttpStatus.NOT_FOUND);
    const [remittance] = await this.prisma.$transaction([
      this.prisma.cashRemittance.create({
        data: { storeId: ctx.storeId, courierId: id, amount: input.amount, method: input.method, note: input.note, validatedById: actor.id },
      }),
      this.prisma.courier.update({ where: { id }, data: { cashBalance: { decrement: input.amount } } }),
    ]);
    return remittance;
  }

  /** Daily report per courier: handed, delivered, refused, expected cash, remitted, gap. */
  async dailyReport(ctx: StoreContext, id: string, day: Date) {
    const courier = await this.prisma.courier.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Livreur introuvable', HttpStatus.NOT_FOUND);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);
    const events = await this.prisma.orderEvent.findMany({
      where: { storeId: ctx.storeId, type: 'STATUS', createdAt: { gte: start, lt: end }, order: { courierId: id } },
      include: { order: { select: { total: true } } },
    });
    const count = (s: string) => events.filter((e) => e.toStatus === s).length;
    const expected = events.filter((e) => e.toStatus === 'DELIVERED').reduce((s, e) => s + e.order.total, 0);
    const remitted = await this.prisma.cashRemittance.aggregate({
      where: { storeId: ctx.storeId, courierId: id, createdAt: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const delivered = count('DELIVERED');
    return {
      courier: { id: courier.id, name: courier.name, cashBalance: courier.cashBalance },
      day: start.toISOString(),
      handed: count('SHIPPED'),
      delivered,
      refused: count('REFUSED'),
      postponed: count('POSTPONED'),
      cashExpected: expected,
      cashRemitted: remitted._sum.amount ?? 0,
      gap: expected - (remitted._sum.amount ?? 0),
      commissionDue: delivered * courier.commission,
    };
  }

  /**
   * Sets the courier's app PIN (§8.1: phone + PIN, no e-mail). Without a value, a 4-digit
   * PIN is generated; it is returned once so the merchant can pass it on, then only its hash is kept.
   */
  async setPin(ctx: StoreContext, actor: AuthUser, id: string, pin?: string) {
    const courier = await this.prisma.courier.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!courier) throw new AppError('COURIER_NOT_FOUND', 'Livreur introuvable', HttpStatus.NOT_FOUND);
    const value = pin ?? String(randomInt(0, 10_000)).padStart(4, '0');
    await this.prisma.courier.update({
      where: { id },
      data: { pinHash: await argon2.hash(value, { type: argon2.argon2id }), pinAttempts: 0, pinLockedUntil: null },
    });
    await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'courier.pin', target: id } });
    return { pin: value, phone: courier.phone };
  }

  /** The courier's own delivery list (PWA livreur). */
  async myDeliveries(ctx: StoreContext): Promise<CourierDeliveriesResponse> {
    const serverTime = new Date().toISOString();
    if (!ctx.courierId) return { courier: null, store: null, orders: [], serverTime };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [courier, store, orders, deliveredToday] = await Promise.all([
      this.prisma.courier.findUniqueOrThrow({ where: { id: ctx.courierId } }),
      this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { id: true, name: true, currency: true, phone: true } }),
      this.prisma.order.findMany({
        where: { storeId: ctx.storeId, courierId: ctx.courierId, status: { in: ['SHIPPED', 'POSTPONED'] } },
        include: { items: { select: { title: true, variantTitle: true, quantity: true } } },
        orderBy: [{ city: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.order.count({ where: { storeId: ctx.storeId, courierId: ctx.courierId, status: 'DELIVERED', deliveredAt: { gte: startOfDay } } }),
    ]);
    return {
      courier: { id: courier.id, name: courier.name, cashBalance: courier.cashBalance, deliveredToday, commission: courier.commission },
      store,
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        city: o.city,
        address: o.address,
        gps: o.gpsLat != null && o.gpsLng != null ? { lat: o.gpsLat, lng: o.gpsLng } : null,
        total: o.total,
        currency: o.currency,
        items: o.items,
        postponedTo: o.postponedTo?.toISOString() ?? null,
        note: o.note,
      })),
      serverTime,
    };
  }

  /**
   * Replays actions recorded offline by the courier app, in the order they happened.
   * Each action carries a client id: an action already applied is acknowledged, not redone,
   * so a flaky network can resend the whole queue safely.
   */
  async sync(ctx: StoreContext, user: AuthUser, input: DeliverySyncInput): Promise<DeliverySyncResult> {
    const results: DeliverySyncResult['results'] = [];
    const actions = [...input.actions].sort((a, b) => a.at.localeCompare(b.at));
    for (const action of actions) {
      const done = await this.prisma.orderEvent.findUnique({ where: { clientActionId: action.id }, select: { id: true } });
      if (done) {
        results.push({ id: action.id, ok: true, duplicate: true });
        continue;
      }
      try {
        const offline = Date.now() - new Date(action.at).getTime() > 60_000;
        await this.orders.changeStatus(
          ctx,
          user,
          action.orderId,
          {
            status: action.status,
            reason: action.reason,
            postponedTo: action.postponedTo,
            note: [action.note, offline ? `Saisi hors connexion le ${new Date(action.at).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC` : null].filter(Boolean).join(' — ') || undefined,
          },
          { clientActionId: action.id },
        );
        results.push({ id: action.id, ok: true });
      } catch (e) {
        const body = e instanceof AppError ? (e.getResponse() as { code?: string; message?: string }) : undefined;
        results.push({ id: action.id, ok: false, error: body?.code ?? 'ERROR', message: body?.message ?? 'Erreur' });
      }
    }
    return { results, deliveries: await this.myDeliveries(ctx) };
  }
}
