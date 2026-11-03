import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  bulkOrderActionSchema,
  manualOrderSchema,
  orderAssignSchema,
  orderListQuerySchema,
  orderNoteSchema,
  orderStatusChangeSchema,
  orderUpdateSchema,
  type BulkOrderActionInput,
  type ManualOrderInput,
  type OrderAssignInput,
  type OrderListQuery,
  type OrderStatusChangeInput,
  type OrderUpdateInput,
} from '@myabeshop/shared';
import { OrdersService } from './orders.service';
import { CurrentStore, CurrentUser, RequirePermission } from '../common/decorators';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod';
import type { AuthUser, StoreContext } from '../common/request';

const contactSchema = z.object({ channel: z.enum(['CALL', 'WHATSAPP']) });
const blacklistSchema = z.object({ blacklisted: z.boolean() });

@ApiTags('orders')
@ApiBearerAuth()
@Controller('stores/:storeId/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission('orders.read.all', 'orders.read.assigned', 'deliveries.read.own')
  @ApiZodQuery(orderListQuerySchema)
  list(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Query(new ZodPipe(orderListQuerySchema)) q: OrderListQuery) {
    return this.orders.list(ctx, user, q);
  }

  @Get('counts')
  @RequirePermission('orders.read.all', 'orders.read.assigned', 'deliveries.read.own')
  counts(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser) {
    return this.orders.counts(ctx, user);
  }

  @Post()
  @RequirePermission('orders.write')
  @ApiZodBody(manualOrderSchema)
  createManual(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(manualOrderSchema)) body: ManualOrderInput) {
    return this.orders.createManual(ctx, user, body);
  }

  @Post('bulk')
  @RequirePermission('orders.assign')
  @ApiZodBody(bulkOrderActionSchema)
  bulk(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(bulkOrderActionSchema)) body: BulkOrderActionInput) {
    return this.orders.bulk(ctx, user, body);
  }

  @Get(':orderId')
  @RequirePermission('orders.read.all', 'orders.read.assigned', 'deliveries.read.own')
  get(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string) {
    return this.orders.get(ctx, id, user);
  }

  @Patch(':orderId')
  @RequirePermission('orders.write')
  @ApiZodBody(orderUpdateSchema)
  update(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(orderUpdateSchema)) body: OrderUpdateInput) {
    return this.orders.update(ctx, user, id, body);
  }

  @Post(':orderId/status')
  @RequirePermission('orders.write', 'orders.confirm', 'deliveries.update.own')
  @ApiZodBody(orderStatusChangeSchema)
  status(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(orderStatusChangeSchema)) body: OrderStatusChangeInput) {
    return this.orders.changeStatus(ctx, user, id, body);
  }

  @Post(':orderId/assign')
  @RequirePermission('orders.assign')
  @ApiZodBody(orderAssignSchema)
  assign(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(orderAssignSchema)) body: OrderAssignInput) {
    return this.orders.assign(ctx, user, id, body);
  }

  @Post(':orderId/notes')
  @RequirePermission('orders.write', 'orders.confirm')
  @ApiZodBody(orderNoteSchema)
  note(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(orderNoteSchema)) body: { note: string }) {
    return this.orders.addNote(ctx, user, id, body.note);
  }

  @Post(':orderId/contact')
  @RequirePermission('orders.write', 'orders.confirm')
  @ApiZodBody(contactSchema)
  contact(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(contactSchema)) body: { channel: 'CALL' | 'WHATSAPP' }) {
    return this.orders.logContact(ctx, user, id, body.channel);
  }

  @Post(':orderId/blacklist')
  @RequirePermission('orders.write')
  @ApiZodBody(blacklistSchema)
  blacklist(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Param('orderId') id: string, @Body(new ZodPipe(blacklistSchema)) body: { blacklisted: boolean }) {
    return this.orders.setBlacklist(ctx, user, id, body.blacklisted);
  }
}
