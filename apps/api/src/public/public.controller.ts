import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { promoValidateSchema, publicOrderSchema, type PublicOrderInput } from '@myabeshop/shared';
import type { Store } from '@prisma/client';
import { Public } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import { config } from '../common/config';
import { OrdersService } from '../orders/orders.service';
import { ZonesService } from '../zones/zones.service';
import { productInclude, toPublicProductDto } from '../products/product.mapper';
import { toPublicStoreDto } from '../stores/store.mapper';
import { PlansService } from '../billing/plans.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { PromosService } from '../promos/promos.service';

const listQuery = z.object({ search: z.string().max(80).optional() });

/** Storefront API: no account needed, read-only except order placement (parcours B). */
@ApiTags('storefront')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly zones: ZonesService,
    private readonly plans: PlansService,
    private readonly integrations: IntegrationsService,
    private readonly promos: PromosService,
  ) {}

  /** Storefront payload: zones plus what the store's plan allows (pixels, promo field, badge). */
  private async storefront(store: Store) {
    const [zones, limits] = await Promise.all([this.zones.list(store.id), this.plans.limits(store.id)]);
    return toPublicStoreDto(store, zones, {
      pixels: await this.integrations.storefrontPixels(store.id, limits.pixels),
      showBadge: limits.showPlatformBadge,
      promoCodes: limits.promoCodes && (await this.prisma.promoCode.count({ where: { storeId: store.id, active: true } })) > 0,
    });
  }

  private async storeBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store || store.status === 'SUSPENDED') throw new AppError('STORE_NOT_FOUND', 'Boutique introuvable', HttpStatus.NOT_FOUND);
    return store;
  }

  private async publicStore(slug: string) {
    return this.storefront(await this.storeBySlug(slug));
  }

  /** Resolves a request host (subdomain or custom domain) to a store slug. */
  @Get('resolve')
  async resolve(@Query(new ZodPipe(z.object({ host: z.string().max(200) }))) q: { host: string }) {
    const host = q.host.toLowerCase().split(':')[0]!;
    const root = config.rootDomain.split(':')[0]!;
    if (host.endsWith(`.${root}`)) {
      const slug = host.slice(0, -(root.length + 1));
      const store = await this.prisma.store.findUnique({ where: { slug }, select: { slug: true } });
      if (store) return { slug: store.slug };
    }
    const custom = await this.prisma.store.findUnique({ where: { customDomain: host }, select: { slug: true } });
    if (custom) return { slug: custom.slug };
    throw new AppError('STORE_NOT_FOUND', 'Boutique introuvable', HttpStatus.NOT_FOUND);
  }

  @Get('stores/:slug')
  store(@Param('slug') slug: string) {
    return this.publicStore(slug);
  }

  @Get('stores/:slug/products')
  async products(@Param('slug') slug: string, @Query(new ZodPipe(listQuery)) q: { search?: string }) {
    const store = await this.storeBySlug(slug);
    const products = await this.prisma.product.findMany({
      where: {
        storeId: store.id,
        status: 'PUBLISHED',
        ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return products.map(toPublicProductDto);
  }

  @Get('stores/:slug/products/:productSlug')
  async product(@Param('slug') slug: string, @Param('productSlug') productSlug: string) {
    const store = await this.storeBySlug(slug);
    const product = await this.prisma.product.findFirst({
      where: { storeId: store.id, slug: productSlug, status: 'PUBLISHED' },
      include: productInclude,
    });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable', HttpStatus.NOT_FOUND);
    return { store: await this.storefront(store), product: toPublicProductDto(product) };
  }

  /** Short product link: plateforme.com/p/<code>. */
  @Get('p/:code')
  async byShortCode(@Param('code') code: string) {
    const product = await this.prisma.product.findUnique({ where: { shortCode: code }, include: { ...productInclude, store: true } });
    if (!product || product.status !== 'PUBLISHED' || product.store.status === 'SUSPENDED') {
      throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable', HttpStatus.NOT_FOUND);
    }
    return {
      store: await this.storefront(product.store),
      product: toPublicProductDto(product),
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('stores/:slug/orders')
  @ApiZodBody(publicOrderSchema)
  async order(@Param('slug') slug: string, @Body(new ZodPipe(publicOrderSchema)) body: PublicOrderInput, @Ip() ip: string) {
    const store = await this.storeBySlug(slug);
    return this.orders.createPublic(store.id, body, { ip });
  }

  /** Promo code preview in the order form. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('stores/:slug/promo/validate')
  @HttpCode(200)
  async validatePromo(@Param('slug') slug: string, @Body(new ZodPipe(promoValidateSchema)) body: { code: string; subtotal: number; deliveryFee: number }) {
    const store = await this.storeBySlug(slug);
    return this.promos.validate(store.id, body.code, body.subtotal, body.deliveryFee);
  }

  /** Order tracking page by unguessable link, no login (§7.4). */
  @Get('track/:token')
  async track(@Param('token') token: string) {
    const order = await this.prisma.order.findUnique({
      where: { trackingToken: token },
      include: {
        items: true,
        events: { where: { type: { in: ['CREATED', 'STATUS'] } }, orderBy: { createdAt: 'asc' } },
        store: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable', HttpStatus.NOT_FOUND);
    return {
      number: order.number,
      status: order.status,
      currency: order.currency,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      customerName: order.customerName,
      city: order.city,
      address: order.address,
      items: order.items.map((i) => ({ title: i.title, variantTitle: i.variantTitle, quantity: i.quantity, total: i.total })),
      createdAt: order.createdAt.toISOString(),
      timeline: order.events.filter((e) => e.toStatus).map((e) => ({ status: e.toStatus!, at: e.createdAt.toISOString() })),
      store: {
        name: order.store.name,
        slug: order.store.slug,
        whatsappPhone: order.store.whatsappPhone,
        phone: order.store.phone,
        primaryColor: order.store.primaryColor,
        logoUrl: order.store.logoUrl,
        locale: order.store.locale,
      },
      pixels: await this.integrations.storefrontPixels(order.storeId, (await this.plans.limits(order.storeId)).pixels),
    };
  }
}
