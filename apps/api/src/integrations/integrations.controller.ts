import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { pixelsConfigSchema, sheetsConfigSchema, type PixelsConfig, type SheetsConfig } from '@myabeshop/shared';
import { CurrentStore, CurrentUser, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { AuthUser, StoreContext } from '../common/request';
import { IntegrationsService } from './integrations.service';

@ApiTags('marketing')
@ApiBearerAuth()
@Controller('stores/:storeId/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermission('marketing.manage')
  get(@CurrentStore() ctx: StoreContext) {
    return this.integrations.get(ctx);
  }

  @Put('pixels')
  @RequirePermission('marketing.manage')
  @ApiZodBody(pixelsConfigSchema)
  pixels(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(pixelsConfigSchema)) body: PixelsConfig) {
    return this.integrations.setPixels(ctx, user, body);
  }

  @Put('sheets')
  @RequirePermission('marketing.manage')
  @ApiZodBody(sheetsConfigSchema)
  sheets(@CurrentStore() ctx: StoreContext, @CurrentUser() user: AuthUser, @Body(new ZodPipe(sheetsConfigSchema)) body: SheetsConfig) {
    return this.integrations.setSheets(ctx, user, body);
  }

  @Delete('sheets')
  @RequirePermission('marketing.manage')
  removeSheets(@CurrentStore() ctx: StoreContext) {
    return this.integrations.removeSheets(ctx);
  }

  @Post('sheets/test')
  @HttpCode(200)
  @RequirePermission('marketing.manage')
  testSheets(@CurrentStore() ctx: StoreContext) {
    return this.integrations.sendTestRow(ctx);
  }
}
