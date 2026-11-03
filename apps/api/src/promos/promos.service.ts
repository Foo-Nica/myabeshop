import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type PromoCode } from '@prisma/client';
import { promoDiscount, type PromoCodeDto, type PromoCodeInput } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import type { AuthUser, StoreContext } from '../common/request';
import { PlansService } from '../billing/plans.service';

export function toPromoDto(p: PromoCode): PromoCodeDto {
  return {
    id: p.id, code: p.code, type: p.type, value: p.value, minSubtotal: p.minSubtotal,
    startsAt: p.startsAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null,
    usageLimit: p.usageLimit, usedCount: p.usedCount, active: p.active, createdAt: p.createdAt.toISOString(),
  };
}

/** Promo codes (§8.4): percentage, fixed amount or free delivery, with dates and usage limit. */
@Injectable()
export class PromosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async list(ctx: StoreContext) {
    const rows = await this.prisma.promoCode.findMany({ where: { storeId: ctx.storeId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toPromoDto);
  }

  async create(ctx: StoreContext, actor: AuthUser, input: PromoCodeInput) {
    await this.plans.assertFeature(ctx.storeId, 'promoCodes');
    try {
      const promo = await this.prisma.promoCode.create({
        data: {
          storeId: ctx.storeId,
          code: input.code,
          type: input.type,
          value: input.type === 'FREE_SHIPPING' ? 0 : input.value,
          minSubtotal: input.minSubtotal ?? null,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          usageLimit: input.usageLimit ?? null,
          active: input.active,
        },
      });
      await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'promo.create', target: promo.code } });
      return toPromoDto(promo);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppError('PROMO_EXISTS', 'Ce code existe déjà', HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async update(ctx: StoreContext, id: string, input: { active?: boolean; endsAt?: string | null; usageLimit?: number | null }) {
    const promo = await this.prisma.promoCode.findFirst({ where: { id, storeId: ctx.storeId } });
    if (!promo) throw new AppError('PROMO_NOT_FOUND', 'Code introuvable', HttpStatus.NOT_FOUND);
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      },
    });
    return toPromoDto(updated);
  }

  async remove(ctx: StoreContext, id: string) {
    const res = await this.prisma.promoCode.deleteMany({ where: { id, storeId: ctx.storeId } });
    if (res.count === 0) throw new AppError('PROMO_NOT_FOUND', 'Code introuvable', HttpStatus.NOT_FOUND);
  }

  /** Finds a usable code or explains why it cannot be used. */
  async findUsable(storeId: string, code: string, subtotal: number, now = new Date()): Promise<PromoCode> {
    if (!(await this.plans.hasFeature(storeId, 'promoCodes'))) throw new AppError('PROMO_INVALID', 'Code promo invalide');
    const promo = await this.prisma.promoCode.findUnique({ where: { storeId_code: { storeId, code: code.trim().toUpperCase() } } });
    if (!promo || !promo.active) throw new AppError('PROMO_INVALID', 'Code promo invalide');
    if (promo.startsAt && promo.startsAt > now) throw new AppError('PROMO_NOT_STARTED', 'Ce code n’est pas encore valable');
    if (promo.endsAt && promo.endsAt < now) throw new AppError('PROMO_EXPIRED', 'Ce code a expiré');
    if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) throw new AppError('PROMO_EXHAUSTED', 'Ce code a déjà été utilisé au maximum');
    if (promo.minSubtotal != null && subtotal < promo.minSubtotal) {
      throw new AppError('PROMO_MIN_SUBTOTAL', 'Montant minimum non atteint pour ce code', HttpStatus.BAD_REQUEST, { minSubtotal: promo.minSubtotal });
    }
    return promo;
  }

  /** Storefront preview: what the customer would save. */
  async validate(storeId: string, code: string, subtotal: number, deliveryFee: number) {
    const promo = await this.findUsable(storeId, code, subtotal);
    return { code: promo.code, type: promo.type, value: promo.value, discount: promoDiscount(promo, subtotal, deliveryFee) };
  }

  /** Consumes one use atomically inside the order transaction (no overselling a limited code). */
  async consume(tx: Prisma.TransactionClient, promoId: string) {
    const res = await tx.promoCode.updateMany({
      where: { id: promoId, active: true, OR: [{ usageLimit: null }, { usedCount: { lt: tx.promoCode.fields.usageLimit } }] },
      data: { usedCount: { increment: 1 } },
    });
    if (res.count === 0) throw new AppError('PROMO_EXHAUSTED', 'Ce code a déjà été utilisé au maximum');
  }
}
