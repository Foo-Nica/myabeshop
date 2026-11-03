import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PRODUCT_STATUSES, createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from '@myabeshop/shared';
import { ProductsService } from './products.service';
import { CurrentStore, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import type { StoreContext } from '../common/request';

const listQuery = z.object({ status: z.enum(PRODUCT_STATUSES).optional(), search: z.string().max(80).optional() });

@ApiTags('products')
@ApiBearerAuth()
@Controller('stores/:storeId/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('products.read')
  list(@CurrentStore() ctx: StoreContext, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.products.list(ctx, q);
  }

  @Post()
  @RequirePermission('products.write')
  @ApiZodBody(createProductSchema)
  create(@CurrentStore() ctx: StoreContext, @Body(new ZodPipe(createProductSchema)) body: CreateProductInput) {
    return this.products.create(ctx, body);
  }

  @Get(':productId')
  @RequirePermission('products.read')
  get(@CurrentStore() ctx: StoreContext, @Param('productId') id: string) {
    return this.products.get(ctx, id);
  }

  @Patch(':productId')
  @RequirePermission('products.write')
  @ApiZodBody(updateProductSchema)
  update(@CurrentStore() ctx: StoreContext, @Param('productId') id: string, @Body(new ZodPipe(updateProductSchema)) body: UpdateProductInput) {
    return this.products.update(ctx, id, body);
  }

  @Post(':productId/duplicate')
  @RequirePermission('products.write')
  duplicate(@CurrentStore() ctx: StoreContext, @Param('productId') id: string) {
    return this.products.duplicate(ctx, id);
  }

  @Delete(':productId')
  @RequirePermission('products.write')
  remove(@CurrentStore() ctx: StoreContext, @Param('productId') id: string) {
    return this.products.remove(ctx, id);
  }
}
