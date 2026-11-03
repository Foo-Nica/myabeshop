import { Body, Controller, Get, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { checkoutSchema, type CheckoutInput } from '@myabeshop/shared';
import { CurrentStore, CurrentUser, Public, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AppRequest, AuthUser, StoreContext } from '../common/request';
import { BillingService } from './billing.service';

const simulateSchema = z.object({ outcome: z.enum(['SUCCEEDED', 'FAILED']) });

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Pricing grid for the landing page and the upgrade screen. */
  @Public()
  @Get('plans')
  plans() {
    return this.billing.publicPlans();
  }

  @ApiBearerAuth()
  @Get('stores/:storeId/billing')
  @RequirePermission('billing.manage')
  overview(@CurrentStore() ctx: StoreContext) {
    return this.billing.overview(ctx);
  }

  @ApiBearerAuth()
  @Post('stores/:storeId/billing/checkout')
  @RequirePermission('billing.manage')
  @ApiZodBody(checkoutSchema)
  checkout(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(checkoutSchema)) body: CheckoutInput) {
    return this.billing.checkout(ctx, user, body);
  }

  @ApiBearerAuth()
  @Post('stores/:storeId/billing/payments/:paymentId/refresh')
  @HttpCode(200)
  @RequirePermission('billing.manage')
  refresh(@CurrentStore() ctx: StoreContext, @Param('paymentId') id: string) {
    return this.billing.refresh(ctx, id);
  }

  @ApiBearerAuth()
  @Get('stores/:storeId/billing/payments/:paymentId/invoice')
  @RequirePermission('billing.manage')
  invoice(@CurrentStore() ctx: StoreContext, @Param('paymentId') id: string) {
    return this.billing.invoice(ctx, id);
  }

  /** Payment provider notifications (signature verified, then status re-fetched). */
  @Public()
  @Post('billing/webhooks/:gateway')
  @HttpCode(200)
  webhook(@Param('gateway') gateway: string, @Req() req: RawBodyRequest<AppRequest>) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    return this.billing.handleWebhook(gateway, raw, req.headers);
  }

  /** Development payment simulator (404 when a real gateway is configured). */
  @Public()
  @Get('billing/simulator/:reference')
  simulatorInfo(@Param('reference') reference: string) {
    return this.billing.simulatorInfo(reference);
  }

  @Public()
  @Post('billing/simulator/:reference')
  @HttpCode(200)
  simulate(@Param('reference') reference: string, @Body(new ZodPipe(simulateSchema)) body: { outcome: 'SUCCEEDED' | 'FAILED' }) {
    return this.billing.simulate(reference, body.outcome);
  }
}
