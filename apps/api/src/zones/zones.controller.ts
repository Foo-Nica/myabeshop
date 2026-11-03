import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { updateZoneSchema, zoneSchema, type ZoneInput } from '@myabeshop/shared';
import { ZonesService } from './zones.service';
import { CurrentStore, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { StoreContext } from '../common/request';

const bulkSchema = z.object({ zones: z.array(zoneSchema).min(1).max(200) });

@ApiTags('delivery-zones')
@ApiBearerAuth()
@Controller('stores/:storeId/zones')
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  @RequirePermission('zones.read', 'deliveries.read.own')
  list(@CurrentStore() ctx: StoreContext) {
    return this.zones.list(ctx.storeId);
  }

  @Post()
  @RequirePermission('zones.write')
  @ApiZodBody(zoneSchema)
  create(@CurrentStore() ctx: StoreContext, @Body(new ZodPipe(zoneSchema)) body: ZoneInput) {
    return this.zones.create(ctx, body);
  }

  @Post('bulk')
  @RequirePermission('zones.write')
  @ApiZodBody(bulkSchema)
  bulk(@CurrentStore() ctx: StoreContext, @Body(new ZodPipe(bulkSchema)) body: { zones: ZoneInput[] }) {
    return this.zones.createMany(ctx, body.zones);
  }

  @Patch(':zoneId')
  @RequirePermission('zones.write')
  @ApiZodBody(updateZoneSchema)
  update(@CurrentStore() ctx: StoreContext, @Param('zoneId') id: string, @Body(new ZodPipe(updateZoneSchema)) body: Partial<ZoneInput>) {
    return this.zones.update(ctx, id, body);
  }

  @Delete(':zoneId')
  @HttpCode(204)
  @RequirePermission('zones.write')
  async remove(@CurrentStore() ctx: StoreContext, @Param('zoneId') id: string) {
    await this.zones.remove(ctx, id);
  }
}
