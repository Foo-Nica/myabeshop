import { Body, Controller, Get, HttpCode, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adminGrantPlanSchema,
  adminPlanUpdateSchema,
  adminStoreListQuerySchema,
  adminSuspendSchema,
  type AdminGrantPlanInput,
  type AdminPlanUpdateInput,
  type AdminStoreListQuery,
} from '@myabeshop/shared';
import { CurrentUser, SuperAdmin } from '../common/decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import type { AuthUser } from '../common/request';
import { AdminService } from './admin.service';
import { BillingService } from '../billing/billing.service';

const auditQuery = z.object({ storeId: z.string().max(64).optional(), action: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

@ApiTags('admin')
@ApiBearerAuth()
@SuperAdmin()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly billing: BillingService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('stores')
  @ApiZodQuery(adminStoreListQuerySchema)
  stores(@Query(new ZodPipe(adminStoreListQuerySchema)) q: AdminStoreListQuery) {
    return this.admin.listStores(q);
  }

  @Get('stores/:id')
  store(@Param('id') id: string) {
    return this.admin.storeDetail(id);
  }

  @Post('stores/:id/suspend')
  @HttpCode(200)
  @ApiZodBody(adminSuspendSchema)
  suspend(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(adminSuspendSchema)) body: { reason: string }, @Ip() ip: string) {
    return this.admin.setSuspended(id, user, true, body.reason, ip);
  }

  @Post('stores/:id/unsuspend')
  @HttpCode(200)
  unsuspend(@Param('id') id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.admin.setSuspended(id, user, false, undefined, ip);
  }

  @Post('stores/:id/plan')
  @HttpCode(200)
  @ApiZodBody(adminGrantPlanSchema)
  grant(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(adminGrantPlanSchema)) body: AdminGrantPlanInput) {
    return this.admin.grantPlan(id, user, body.planCode, body.days, body.note);
  }

  /** Support: opens a 30-minute session as the store owner (audited). */
  @Post('stores/:id/impersonate')
  @HttpCode(200)
  impersonate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.admin.impersonate(id, user, ip);
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Patch('plans/:id')
  @ApiZodBody(adminPlanUpdateSchema)
  updatePlan(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body(new ZodPipe(adminPlanUpdateSchema)) body: AdminPlanUpdateInput) {
    return this.admin.updatePlan(id, user, body);
  }

  @Get('payments')
  payments() {
    return this.admin.payments();
  }

  @Get('audit')
  audit(@Query(new ZodPipe(auditQuery)) q: { storeId?: string; action?: string; limit: number }) {
    return this.admin.audit(q);
  }

  /** Runs the subscription lifecycle now (normally hourly). */
  @Post('billing/run-lifecycle')
  @HttpCode(200)
  runLifecycle() {
    return this.billing.runLifecycle();
  }
}
