import { HttpStatus, Injectable } from '@nestjs/common';
import {
  RESERVED_SLUGS,
  getCountry,
  normalizePhone,
  slugify,
  type CreateStoreInput,
  type InviteMemberInput,
  type StoreRole,
  type StoreWithRole,
  type UpdateStoreInput,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { storeUrl } from '../common/config';
import type { AuthUser, StoreContext } from '../common/request';
import { toStoreDto } from './store.mapper';
import { TRIAL_DAYS } from '@myabeshop/shared';
import { PlansService } from '../billing/plans.service';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async isSlugAvailable(slug: string): Promise<boolean> {
    if (RESERVED_SLUGS.has(slug) || slug.length < 3) return false;
    const existing = await this.prisma.store.findUnique({ where: { slug }, select: { id: true } });
    return !existing;
  }

  async suggestSlug(name: string): Promise<string> {
    const base = slugify(name) || 'boutique';
    const padded = base.length < 3 ? `${base}-shop` : base;
    if (await this.isSlugAvailable(padded)) return padded;
    for (let i = 2; i < 50; i++) {
      const candidate = `${padded.slice(0, 44)}-${i}`;
      if (await this.isSlugAvailable(candidate)) return candidate;
    }
    return `${padded.slice(0, 40)}-${Date.now().toString(36).slice(-6)}`;
  }

  async create(user: AuthUser, input: CreateStoreInput): Promise<StoreWithRole> {
    const country = getCountry(input.country);
    if (!country) throw new AppError('INVALID_COUNTRY', 'Pays non pris en charge');
    let slug: string;
    if (input.slug) {
      if (!(await this.isSlugAvailable(input.slug))) {
        throw new AppError('SLUG_TAKEN', 'Cette adresse est déjà prise', HttpStatus.CONFLICT, {
          suggestion: await this.suggestSlug(input.slug),
        });
      }
      slug = input.slug;
    } else {
      slug = await this.suggestSlug(input.name);
    }
    const whatsappPhone = input.whatsappPhone ? normalizePhone(input.whatsappPhone, input.country)?.e164 ?? null : null;
    // Referral (§9.3): unknown codes are ignored rather than blocking the sign-up.
    const referrer = input.referralCode
      ? await this.prisma.store.findUnique({ where: { referralCode: input.referralCode }, select: { id: true } })
      : null;

    const store = await this.prisma.$transaction(async (tx) => {
      const pro = await tx.plan.findUnique({ where: { code: 'pro' } });
      const free = await tx.plan.findUnique({ where: { code: 'free' } });
      const created = await tx.store.create({
        data: {
          name: input.name,
          slug,
          country: input.country,
          currency: input.currency ?? country.currency,
          category: input.category,
          logoUrl: input.logoUrl,
          locale: input.locale,
          whatsappPhone,
          planId: pro?.id ?? free?.id,
          referredById: referrer?.id ?? null,
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
      });
      if (pro) {
        // 14-day Pro trial at sign-up (cahier des charges §9.1).
        await tx.subscription.create({
          data: {
            storeId: created.id,
            planId: pro.id,
            status: 'TRIALING',
            startsAt: new Date(),
            endsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
            source: 'trial',
          },
        });
      }
      await tx.auditLog.create({ data: { storeId: created.id, actorId: user.id, action: 'store.create', target: created.id } });
      return created;
    });
    return { ...toStoreDto(store), role: 'OWNER', url: storeUrl(store.slug) };
  }

  async listMine(user: AuthUser): Promise<StoreWithRole[]> {
    const memberships = await this.prisma.storeMember.findMany({
      where: { userId: user.id },
      include: { store: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...toStoreDto(m.store), role: m.role as StoreRole, url: storeUrl(m.store.slug) }));
  }

  async get(ctx: StoreContext): Promise<StoreWithRole> {
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    return { ...toStoreDto(store), role: ctx.role, url: storeUrl(store.slug) };
  }

  async update(ctx: StoreContext, user: AuthUser, input: UpdateStoreInput): Promise<StoreWithRole> {
    const { closed, social, whatsappPhone, phone, ...rest } = input;
    const current = await this.prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId } });
    const normalize = (v: string | null | undefined) => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      const n = normalizePhone(v, current.country);
      if (!n) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide pour ce pays');
      return n.e164;
    };
    let status = current.status;
    if (closed !== undefined && current.status !== 'SUSPENDED') status = closed ? 'CLOSED' : 'ACTIVE';
    const store = await this.prisma.store.update({
      where: { id: ctx.storeId },
      data: {
        ...rest,
        status,
        social: social ?? undefined,
        whatsappPhone: normalize(whatsappPhone),
        phone: normalize(phone),
      },
    });
    await this.prisma.auditLog.create({
      data: { storeId: ctx.storeId, actorId: user.id, action: 'store.update', target: ctx.storeId, meta: { fields: Object.keys(input) } },
    });
    return { ...toStoreDto(store), role: ctx.role, url: storeUrl(store.slug) };
  }

  async listMembers(ctx: StoreContext) {
    const members = await this.prisma.storeMember.findMany({
      where: { storeId: ctx.storeId },
      include: { user: { select: { id: true, name: true, phone: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt, user: m.user }));
  }

  /** Adds a team member. They sign in with their phone (OTP) or e-mail. */
  async inviteMember(ctx: StoreContext, actor: AuthUser, input: InviteMemberInput) {
    if (input.role === 'AGENT') await this.plans.assertFeature(ctx.storeId, 'agents');
    if (input.role === 'COURIER') await this.plans.assertFeature(ctx.storeId, 'couriers');
    const isEmail = input.target.includes('@');
    let where: { email: string } | { phone: string };
    if (isEmail) where = { email: input.target.toLowerCase() };
    else {
      const phone = normalizePhone(input.target, ctx.country);
      if (!phone) throw new AppError('INVALID_PHONE', 'Numéro de téléphone invalide pour ce pays');
      where = { phone: phone.e164 };
    }
    const existingUser = await this.prisma.user.findUnique({ where });
    const already = existingUser
      ? await this.prisma.storeMember.findUnique({ where: { storeId_userId: { storeId: ctx.storeId, userId: existingUser.id } } })
      : null;
    if (input.role !== 'COURIER' && (!already || already.role === 'COURIER')) await this.plans.assertCanAddMember(ctx.storeId);
    const user = existingUser ?? (await this.prisma.user.create({ data: { ...where, name: input.name } }));
    const member = await this.prisma.storeMember.upsert({
      where: { storeId_userId: { storeId: ctx.storeId, userId: user.id } },
      create: { storeId: ctx.storeId, userId: user.id, role: input.role },
      update: { role: input.role },
    });
    if (input.role === 'COURIER' && 'phone' in where) {
      await this.prisma.courier.upsert({
        where: { storeId_phone: { storeId: ctx.storeId, phone: where.phone } },
        create: { storeId: ctx.storeId, userId: user.id, name: input.name, phone: where.phone },
        update: { userId: user.id },
      });
    }
    await this.prisma.auditLog.create({
      data: { storeId: ctx.storeId, actorId: actor.id, action: 'member.invite', target: user.id, meta: { role: input.role } },
    });
    return { id: member.id, role: member.role, user: { id: user.id, name: user.name, phone: user.phone, email: user.email } };
  }

  async removeMember(ctx: StoreContext, actor: AuthUser, memberId: string) {
    const member = await this.prisma.storeMember.findFirst({ where: { id: memberId, storeId: ctx.storeId } });
    if (!member) throw new AppError('NOT_FOUND', 'Membre introuvable', HttpStatus.NOT_FOUND);
    if (member.role === 'OWNER') throw new AppError('CANNOT_REMOVE_OWNER', 'Le propriétaire ne peut pas être retiré');
    await this.prisma.storeMember.delete({ where: { id: member.id } });
    await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'member.remove', target: member.userId } });
  }
}
