import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminOverview,
  AdminPlanUpdateInput,
  AdminStoreDetail,
  AdminStoreListQuery,
  AdminStoreRow,
  AuditEntry,
  Paginated,
  PlanLimits,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { storeUrl } from '../common/config';
import type { AuthUser } from '../common/request';
import { PlansService, toPlanDto } from '../billing/plans.service';
import { BillingService, toPaymentDto } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';

const DAY = 86_400_000;
const storeRowInclude = {
  plan: { select: { code: true } },
  members: { where: { role: 'OWNER' as const }, include: { user: { select: { id: true, name: true, phone: true, email: true } } }, take: 1 },
  subscriptions: { where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] as ('TRIALING' | 'ACTIVE' | 'PAST_DUE')[] } }, orderBy: { endsAt: 'desc' as const }, take: 1 },
  _count: { select: { products: true } },
} satisfies Prisma.StoreInclude;

type StoreRow = Prisma.StoreGetPayload<{ include: typeof storeRowInclude }>;

/** Platform back-office (§9.2). Every write is recorded in the audit log. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly billing: BillingService,
    private readonly auth: AuthService,
  ) {}

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [total, new30d, suspended, activeRows, ordersToday, orders30d, delivered30d, subs, churned30d, plans, signupRows, collected] = await Promise.all([
      this.prisma.store.count(),
      this.prisma.store.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.store.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.order.groupBy({ by: ['storeId'], where: { createdAt: { gte: d30 } } }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.order.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.order.count({ where: { createdAt: { gte: d30 }, status: 'DELIVERED' } }),
      this.prisma.subscription.findMany({ where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, startsAt: { lte: now } }, include: { plan: true } }),
      this.prisma.subscription.count({ where: { status: 'EXPIRED', endsAt: { gte: new Date(now.getTime() - 37 * DAY) }, source: { not: 'trial' } } }),
      this.prisma.plan.findMany({ orderBy: { price: 'asc' }, include: { _count: { select: { stores: true } } } }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS count FROM stores WHERE created_at >= ${d30} GROUP BY 1 ORDER BY 1`,
      this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED', paidAt: { gte: d30 } }, _sum: { amount: true } }),
    ]);
    const paying = subs.filter((s) => s.status !== 'TRIALING' && s.source === 'payment');
    // MRR: what paid subscriptions bring per month (annual plans count for a twelfth of their price × 10 months).
    const payments = await this.prisma.payment.findMany({ where: { subscriptionId: { in: paying.map((s) => s.id) } }, select: { amount: true, months: true } });
    const mrr = Math.round(payments.reduce((s, p) => s + p.amount / p.months, 0));
    const byDay = new Map(signupRows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]));
    const signups: AdminOverview['signups'] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
      signups.push({ day, count: byDay.get(day) ?? 0 });
    }
    return {
      stores: { total, active30d: activeRows.length, new30d, suspended },
      orders: { today: ordersToday, last30d: orders30d, delivered30d },
      revenue: { mrr, collected30d: collected._sum.amount ?? 0, currency: 'XOF' },
      subscriptions: {
        trialing: subs.filter((s) => s.status === 'TRIALING').length,
        paying: new Set(paying.map((s) => s.storeId)).size,
        pastDue: subs.filter((s) => s.status === 'PAST_DUE').length,
        churned30d,
      },
      plans: plans.map((p) => ({ code: p.code, name: p.name, stores: p._count.stores })),
      signups,
    };
  }

  private toRow(s: StoreRow, orders30d: number): AdminStoreRow {
    const owner = s.members[0]?.user ?? null;
    const sub = s.subscriptions[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      country: s.country,
      status: s.status,
      planCode: s.plan?.code ?? null,
      subscriptionStatus: sub?.status ?? null,
      subscriptionEndsAt: sub?.endsAt.toISOString() ?? null,
      owner,
      orders30d,
      products: s._count.products,
      createdAt: s.createdAt.toISOString(),
    };
  }

  private async orders30d(storeIds: string[]) {
    const rows = await this.prisma.order.groupBy({ by: ['storeId'], where: { storeId: { in: storeIds }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.storeId, r._count._all]));
  }

  async listStores(q: AdminStoreListQuery): Promise<Paginated<AdminStoreRow>> {
    const where: Prisma.StoreWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.plan ? { plan: { code: q.plan } } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { slug: { contains: q.q.toLowerCase() } },
              { members: { some: { role: 'OWNER', user: { OR: [{ phone: { contains: q.q.replace(/\s/g, '') } }, { email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.store.findMany({
      where,
      include: storeRowInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const counts = await this.orders30d(page.map((s) => s.id));
    return { items: page.map((s) => this.toRow(s, counts.get(s.id) ?? 0)), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  async storeDetail(id: string): Promise<AdminStoreDetail> {
    const s = await this.prisma.store.findUnique({ where: { id }, include: storeRowInclude });
    if (!s) throw new AppError('STORE_NOT_FOUND', 'Boutique introuvable', HttpStatus.NOT_FOUND);
    const [counts, usage, payments, subscriptions, audit] = await Promise.all([
      this.orders30d([id]),
      this.plans.usage(id),
      this.prisma.payment.findMany({ where: { storeId: id }, include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.subscription.findMany({ where: { storeId: id }, include: { plan: { select: { code: true } } }, orderBy: { startsAt: 'desc' }, take: 20 }),
      this.audit({ storeId: id, limit: 30 }),
    ]);
    return {
      ...this.toRow(s, counts.get(id) ?? 0),
      url: storeUrl(s.slug),
      suspendedReason: s.suspendedReason,
      usage,
      payments: payments.map(toPaymentDto),
      subscriptions: subscriptions.map((x) => ({ id: x.id, planCode: x.plan.code, status: x.status, startsAt: x.startsAt.toISOString(), endsAt: x.endsAt.toISOString(), source: x.source })),
      audit,
    };
  }

  async setSuspended(id: string, actor: AuthUser, suspended: boolean, reason?: string, ip?: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new AppError('STORE_NOT_FOUND', 'Boutique introuvable', HttpStatus.NOT_FOUND);
    await this.prisma.store.update({
      where: { id },
      data: suspended ? { status: 'SUSPENDED', suspendedReason: reason ?? null } : { status: 'ACTIVE', suspendedReason: null },
    });
    await this.prisma.auditLog.create({ data: { storeId: id, actorId: actor.id, action: suspended ? 'admin.suspend' : 'admin.unsuspend', target: id, meta: { reason }, ip } });
    return this.storeDetail(id);
  }

  async grantPlan(id: string, actor: AuthUser, planCode: string, days: number, note?: string) {
    await this.billing.grant(id, planCode, days, actor.id, note);
    return this.storeDetail(id);
  }

  async impersonate(id: string, actor: AuthUser, ip?: string) {
    const owner = await this.prisma.storeMember.findFirst({ where: { storeId: id, role: 'OWNER' } });
    if (!owner) throw new AppError('OWNER_NOT_FOUND', 'Propriétaire introuvable', HttpStatus.NOT_FOUND);
    await this.prisma.auditLog.create({ data: { storeId: id, actorId: actor.id, action: 'admin.impersonate', target: owner.userId, ip } });
    return { ...(await this.auth.impersonate(actor.id, owner.userId, ip)), storeId: id };
  }

  async listPlans() {
    const plans = await this.prisma.plan.findMany({ orderBy: { price: 'asc' }, include: { _count: { select: { stores: true } } } });
    return plans.map((p) => ({ ...toPlanDto(p), stores: p._count.stores }));
  }

  async updatePlan(id: string, actor: AuthUser, input: AdminPlanUpdateInput) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan introuvable', HttpStatus.NOT_FOUND);
    if (plan.code === 'free' && input.price) throw new AppError('INVALID', 'Le plan Gratuit reste à 0');
    const limits = input.limits ? { ...(plan.limits as unknown as PlanLimits), ...input.limits } : undefined;
    const updated = await this.prisma.plan.update({
      where: { id },
      data: { name: input.name, price: input.price, active: input.active, ...(limits ? { limits: limits as unknown as Prisma.InputJsonValue } : {}) },
    });
    await this.prisma.auditLog.create({ data: { actorId: actor.id, action: 'admin.plan_update', target: plan.code, meta: input as Prisma.InputJsonValue } });
    return toPlanDto(updated);
  }

  async payments(limit = 50) {
    const rows = await this.prisma.payment.findMany({ include: { plan: true, store: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((p) => ({ ...toPaymentDto(p), store: p.store }));
  }

  async audit(q: { storeId?: string; action?: string; limit?: number }): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { ...(q.storeId ? { storeId: q.storeId } : {}), ...(q.action ? { action: { startsWith: q.action } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 100,
    });
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[] } }, select: { id: true, name: true } });
    const name = new Map(actors.map((a) => [a.id, a.name]));
    return rows.map((r) => ({ id: r.id, storeId: r.storeId, actorId: r.actorId, actorName: r.actorId ? (name.get(r.actorId) ?? null) : null, action: r.action, target: r.target, meta: r.meta, ip: r.ip, createdAt: r.createdAt.toISOString() }));
  }
}
