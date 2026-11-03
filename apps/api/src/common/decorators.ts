import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Permission } from '@myabeshop/shared';
import type { AppRequest } from './request';

export const IS_PUBLIC = 'isPublic';
/** Route reachable without a token (storefront, auth). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** The caller needs at least one of these permissions in the store named by :storeId. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user!;
});

export const CurrentStore = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().store!;
});
