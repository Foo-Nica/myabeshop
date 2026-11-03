import { HttpStatus, Injectable } from '@nestjs/common';
import { normalizePhone, type CourierDto, type CourierInput, type RemittanceInput } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import type { AuthUser, StoreContext } from '../common/request';

@Injectable()
export class CouriersService {
  constructor(private readonly prisma: PrismaService) {}

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
    }));
  }

  /**
   * Creates a courier and gives them a COURIER membership so they can sign in with their
   * phone number and see only their own deliveries.
   */
  async create(ctx: StoreContext, actor: AuthUser, input: CourierInput): Promise<CourierDto> {
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
    return { ...courier, activeDeliveries: 0 };
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

  /** The courier's own delivery list (PWA livreur, phase 2 of the roadmap). */
  async myDeliveries(ctx: StoreContext) {
    if (!ctx.courierId) return { courier: null, orders: [] };
    const courier = await this.prisma.courier.findUniqueOrThrow({ where: { id: ctx.courierId } });
    const orders = await this.prisma.order.findMany({
      where: { storeId: ctx.storeId, courierId: ctx.courierId, status: { in: ['SHIPPED', 'POSTPONED'] } },
      include: { items: { select: { title: true, variantTitle: true, quantity: true } }, zone: { select: { name: true } } },
      orderBy: [{ city: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      courier: { id: courier.id, name: courier.name, cashBalance: courier.cashBalance },
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
        postponedTo: o.postponedTo,
      })),
    };
  }
}
