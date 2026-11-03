import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createStoreSchema,
  inviteMemberSchema,
  slugSchema,
  updateStoreSchema,
  type CreateStoreInput,
  type InviteMemberInput,
  type UpdateStoreInput,
} from '@myabeshop/shared';
import { z } from 'zod';
import { StoresService } from './stores.service';
import { CurrentStore, CurrentUser, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AuthUser, StoreContext } from '../common/request';

@ApiTags('stores')
@ApiBearerAuth()
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  listMine(@CurrentUser() user: AuthUser) {
    return this.stores.listMine(user);
  }

  @Post()
  @ApiZodBody(createStoreSchema)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createStoreSchema)) body: CreateStoreInput) {
    return this.stores.create(user, body);
  }

  @Get('slug-availability')
  async slugAvailability(@Query(new ZodPipe(z.object({ slug: z.string().optional(), name: z.string().optional() }))) q: { slug?: string; name?: string }) {
    const parsed = q.slug ? slugSchema.safeParse(q.slug) : null;
    const available = parsed?.success ? await this.stores.isSlugAvailable(parsed.data) : false;
    const suggestion = await this.stores.suggestSlug(q.name || q.slug || 'boutique');
    return { slug: parsed?.success ? parsed.data : null, available, suggestion };
  }

  @Get(':storeId')
  @RequirePermission('store.read')
  get(@CurrentStore() ctx: StoreContext) {
    return this.stores.get(ctx);
  }

  @Patch(':storeId')
  @RequirePermission('store.update')
  @ApiZodBody(updateStoreSchema)
  update(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(updateStoreSchema)) body: UpdateStoreInput) {
    return this.stores.update(ctx, user, body);
  }

  @Get(':storeId/members')
  @RequirePermission('team.manage')
  members(@CurrentStore() ctx: StoreContext) {
    return this.stores.listMembers(ctx);
  }

  @Post(':storeId/members')
  @RequirePermission('team.manage')
  @ApiZodBody(inviteMemberSchema)
  invite(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(inviteMemberSchema)) body: InviteMemberInput) {
    return this.stores.inviteMember(ctx, user, body);
  }

  @Delete(':storeId/members/:memberId')
  @HttpCode(204)
  @RequirePermission('team.manage')
  async removeMember(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('memberId') memberId: string) {
    await this.stores.removeMember(ctx, user, memberId);
  }
}
