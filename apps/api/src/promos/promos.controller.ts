import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { promoCodeSchema, updatePromoCodeSchema, type PromoCodeInput } from '@myabeshop/shared';
import { CurrentStore, CurrentUser, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AuthUser, StoreContext } from '../common/request';
import { PromosService } from './promos.service';

@ApiTags('marketing')
@ApiBearerAuth()
@Controller('stores/:storeId/promo-codes')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  @RequirePermission('marketing.manage')
  list(@CurrentStore() ctx: StoreContext) {
    return this.promos.list(ctx);
  }

  @Post()
  @RequirePermission('marketing.manage')
  @ApiZodBody(promoCodeSchema)
  create(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(promoCodeSchema)) body: PromoCodeInput) {
    return this.promos.create(ctx, user, body);
  }

  @Patch(':promoId')
  @RequirePermission('marketing.manage')
  update(@CurrentStore() ctx: StoreContext, @Param('promoId') id: string, @Body(new ZodPipe(updatePromoCodeSchema)) body: { active?: boolean; endsAt?: string | null; usageLimit?: number | null }) {
    return this.promos.update(ctx, id, body);
  }

  @Delete(':promoId')
  @HttpCode(204)
  @RequirePermission('marketing.manage')
  async remove(@CurrentStore() ctx: StoreContext, @Param('promoId') id: string) {
    await this.promos.remove(ctx, id);
  }
}
