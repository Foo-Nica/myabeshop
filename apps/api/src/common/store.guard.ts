import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { roleHas, type Permission, type StoreRole } from '@myabeshop/shared';
import { PERMISSIONS_KEY } from './decorators';
import { PrismaService } from './prisma.service';
import type { AppRequest } from './request';

/**
 * Tenant isolation: every route under /stores/:storeId checks that the caller is a member
 * of that store and that their role grants the required permission. Services then scope
 * every query with the storeId taken from this context, never from the request body.
 */
@Injectable()
export class StoreGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const storeId = req.params?.storeId as string | undefined;
    if (!storeId) return true;
    if (!req.user) return false;

    const membership = await this.prisma.storeMember.findUnique({
      where: { storeId_userId: { storeId, userId: req.user.id } },
      include: { store: true },
    });
    // Same answer for "does not exist" and "not yours": never reveal other stores.
    if (!membership) throw new NotFoundException({ code: 'STORE_NOT_FOUND', message: 'Boutique introuvable' });

    const role = membership.role as StoreRole;
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    if (required.length > 0 && !required.some((p) => roleHas(role, p))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: "Votre rôle ne permet pas cette action" });
    }
    if (membership.store.status === 'SUSPENDED' && req.method !== 'GET') {
      throw new ForbiddenException({ code: 'STORE_SUSPENDED', message: 'Boutique suspendue' });
    }

    let courierId: string | null = null;
    if (role === 'COURIER') {
      const courier = await this.prisma.courier.findFirst({ where: { storeId, userId: req.user.id }, select: { id: true } });
      courierId = courier?.id ?? null;
    }

    req.store = {
      storeId,
      role,
      currency: membership.store.currency,
      country: membership.store.country,
      name: membership.store.name,
      slug: membership.store.slug,
      locale: membership.store.locale,
      courierId,
    };
    return true;
  }
}
