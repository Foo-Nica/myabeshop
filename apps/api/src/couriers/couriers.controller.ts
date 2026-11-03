import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  courierPinSchema,
  courierSchema,
  deliverySyncSchema,
  remittanceSchema,
  updateCourierSchema,
  type CourierInput,
  type CourierPinInput,
  type DeliverySyncInput,
  type RemittanceInput,
} from '@myabeshop/shared';
import { CouriersService } from './couriers.service';
import { CurrentStore, CurrentUser, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AuthUser, StoreContext } from '../common/request';

const reportQuery = z.object({ day: z.string().date().optional() });

@ApiTags('couriers')
@ApiBearerAuth()
@Controller('stores/:storeId')
export class CouriersController {
  constructor(private readonly couriers: CouriersService) {}

  @Get('couriers')
  @RequirePermission('couriers.read')
  list(@CurrentStore() ctx: StoreContext) {
    return this.couriers.list(ctx);
  }

  @Post('couriers')
  @RequirePermission('couriers.write')
  @ApiZodBody(courierSchema)
  create(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(courierSchema)) body: CourierInput) {
    return this.couriers.create(ctx, user, body);
  }

  @Patch('couriers/:courierId')
  @RequirePermission('couriers.write')
  @ApiZodBody(updateCourierSchema)
  update(@CurrentStore() ctx: StoreContext, @Param('courierId') id: string, @Body(new ZodPipe(updateCourierSchema)) body: Partial<CourierInput>) {
    return this.couriers.update(ctx, id, body);
  }

  @Post('couriers/:courierId/remittances')
  @RequirePermission('couriers.write')
  @ApiZodBody(remittanceSchema)
  remit(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('courierId') id: string, @Body(new ZodPipe(remittanceSchema)) body: RemittanceInput) {
    return this.couriers.remit(ctx, user, id, body);
  }

  @Get('couriers/:courierId/report')
  @RequirePermission('couriers.read')
  report(@CurrentStore() ctx: StoreContext, @Param('courierId') id: string, @Query(new ZodPipe(reportQuery)) q: { day?: string }) {
    return this.couriers.dailyReport(ctx, id, q.day ? new Date(q.day) : new Date());
  }

  @Post('couriers/:courierId/pin')
  @RequirePermission('couriers.write')
  @ApiZodBody(courierPinSchema)
  setPin(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('courierId') id: string, @Body(new ZodPipe(courierPinSchema)) body: CourierPinInput) {
    return this.couriers.setPin(ctx, user, id, body.pin);
  }

  /** Offline queue of the courier app (idempotent replay). */
  @Post('deliveries/sync')
  @HttpCode(200)
  @RequirePermission('deliveries.update.own')
  @ApiZodBody(deliverySyncSchema)
  sync(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(deliverySyncSchema)) body: DeliverySyncInput) {
    return this.couriers.sync(ctx, user, body);
  }

  @Get('deliveries/mine')
  @RequirePermission('deliveries.read.own')
  mine(@CurrentStore() ctx: StoreContext) {
    return this.couriers.myDeliveries(ctx);
  }
}
