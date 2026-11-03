import { HttpStatus, Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PLAN_FEATURE_LABELS, type PlanDto, type PlanFeature, type PlanLimits, type UsageDto } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';

export function toPlanDto(p: Plan): PlanDto {
  return { id: p.id, code: p.code, name: p.name, price: p.price, currency: p.currency, limits: p.limits as unknown as PlanLimits, active: p.active };
}

const FREE_FALLBACK: PlanLimits = {
  ordersPerMonth: 50, products: 10, members: 1, customDomain: false, couriers: false, pixels: false,
  promoCodes: false, agents: false, sheets: false, showPlatformBadge: true,
};

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Plan limits (§9.1), checked server-side. The store's current plan is `stores.plan_id`,
 * kept in sync with subscriptions by BillingService (trial, payment, grace, downgrade).
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
    return plans.map(toPlanDto);
  }

  async planOf(storeId: string): Promise<PlanDto> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, include: { plan: true } });
    if (store?.plan) return toPlanDto(store.plan);
    const free = await this.prisma.plan.findUnique({ where: { code: 'free' } });
    return free ? toPlanDto(free) : { id: 'free', code: 'free', name: 'Gratuit', price: 0, currency: 'XOF', limits: FREE_FALLBACK, active: true };
  }

  async limits(storeId: string): Promise<PlanLimits> {
    return (await this.planOf(storeId)).limits;
  }

  async usage(storeId: string): Promise<UsageDto> {
    const [ordersThisMonth, products, members, couriers] = await Promise.all([
      this.prisma.order.count({ where: { storeId, createdAt: { gte: startOfMonth() } } }),
      this.prisma.product.count({ where: { storeId, status: { not: 'ARCHIVED' } } }),
      this.prisma.storeMember.count({ where: { storeId, role: { not: 'COURIER' } } }),
      this.prisma.courier.count({ where: { storeId, active: true } }),
    ]);
    return { ordersThisMonth, products, members, couriers };
  }

  async hasFeature(storeId: string, feature: PlanFeature): Promise<boolean> {
    return !!(await this.limits(storeId))[feature];
  }

  async assertFeature(storeId: string, feature: PlanFeature) {
    if (!(await this.hasFeature(storeId, feature))) {
      throw new AppError('PLAN_FEATURE', `${PLAN_FEATURE_LABELS[feature]} : fonctionnalité non incluse dans votre plan`, HttpStatus.PAYMENT_REQUIRED, { feature });
    }
  }

  async assertCanAddProduct(storeId: string) {
    const { products } = await this.limits(storeId);
    if (products == null) return;
    const count = await this.prisma.product.count({ where: { storeId, status: { not: 'ARCHIVED' } } });
    if (count >= products) {
      throw new AppError('PLAN_LIMIT', `Votre plan permet ${products} produits. Passez au plan supérieur pour en ajouter.`, HttpStatus.PAYMENT_REQUIRED, { limit: 'products', max: products });
    }
  }

  async assertCanAddMember(storeId: string) {
    const { members } = await this.limits(storeId);
    if (members == null) return;
    const count = await this.prisma.storeMember.count({ where: { storeId, role: { not: 'COURIER' } } });
    if (count >= members) {
      throw new AppError('PLAN_LIMIT', `Votre plan permet ${members} membre(s) d’équipe.`, HttpStatus.PAYMENT_REQUIRED, { limit: 'members', max: members });
    }
  }

  /** True when the store already received its monthly quota of orders. */
  async ordersQuotaReached(storeId: string): Promise<boolean> {
    const { ordersPerMonth } = await this.limits(storeId);
    if (ordersPerMonth == null) return false;
    const count = await this.prisma.order.count({ where: { storeId, createdAt: { gte: startOfMonth() } } });
    return count >= ordersPerMonth;
  }
}
