import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  shortCode,
  slugify,
  type CreateProductInput,
  type ProductDto,
  type UpdateProductInput,
  type VariantInput,
} from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { PlansService } from '../billing/plans.service';
import { AppError } from '../common/errors';
import type { StoreContext } from '../common/request';
import { productInclude, toProductDto } from './product.mapper';

function variantTitle(options: string[], values: Record<string, string>) {
  return options.map((o) => values[o]).filter(Boolean).join(' / ');
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  private async uniqueSlug(storeId: string, title: string, excludeId?: string) {
    const base = slugify(title, 80) || 'produit';
    let slug = base;
    for (let i = 2; ; i++) {
      const clash = await this.prisma.product.findFirst({
        where: { storeId, slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${base}-${i}`;
    }
  }

  private async uniqueShortCode() {
    for (let i = 0; i < 10; i++) {
      const code = shortCode();
      const clash = await this.prisma.product.findUnique({ where: { shortCode: code }, select: { id: true } });
      if (!clash) return code;
    }
    throw new Error('Could not allocate a product short code');
  }

  private async findOwned(ctx: StoreContext, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, storeId: ctx.storeId }, include: productInclude });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable', HttpStatus.NOT_FOUND);
    return product;
  }

  async list(ctx: StoreContext, q: { status?: string; search?: string }): Promise<ProductDto[]> {
    const products = await this.prisma.product.findMany({
      where: {
        storeId: ctx.storeId,
        ...(q.status ? { status: q.status as never } : { status: { not: 'ARCHIVED' } }),
        ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return products.map(toProductDto);
  }

  async get(ctx: StoreContext, id: string): Promise<ProductDto> {
    return toProductDto(await this.findOwned(ctx, id));
  }

  async create(ctx: StoreContext, input: CreateProductInput): Promise<ProductDto> {
    await this.plans.assertCanAddProduct(ctx.storeId);
    const slug = await this.uniqueSlug(ctx.storeId, input.title);
    const code = await this.uniqueShortCode();
    const product = await this.prisma.product.create({
      data: {
        storeId: ctx.storeId,
        title: input.title,
        slug,
        shortCode: code,
        description: input.description,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        cost: input.cost ?? null,
        status: input.status,
        images: input.images,
        videoUrl: input.videoUrl ?? null,
        options: input.options,
        trackStock: input.trackStock,
        stock: input.stock ?? null,
        lowStockThreshold: input.lowStockThreshold ?? null,
        variants: {
          create: input.variants.map((v, i) => this.variantData(ctx.storeId, input.options, v, i)),
        },
        quantityOffers: {
          create: input.quantityOffers.map((o) => ({ storeId: ctx.storeId, quantity: o.quantity, price: o.price, label: o.label ?? null })),
        },
      },
      include: productInclude,
    });
    return toProductDto(product);
  }

  private variantData(storeId: string, options: string[], v: VariantInput, position: number) {
    return {
      storeId,
      options: v.options,
      title: variantTitle(options, v.options),
      price: v.price ?? null,
      stock: v.stock ?? null,
      sku: v.sku ?? null,
      position,
    };
  }

  async update(ctx: StoreContext, id: string, input: UpdateProductInput): Promise<ProductDto> {
    const existing = await this.findOwned(ctx, id);
    const options = input.options ?? existing.options;
    const price = input.price ?? existing.price;
    const compareAt = input.compareAtPrice !== undefined ? input.compareAtPrice : existing.compareAtPrice;
    if (compareAt != null && compareAt <= price) {
      throw new AppError('VALIDATION_ERROR', 'Le prix barré doit être supérieur au prix');
    }

    await this.prisma.$transaction(async (tx) => {
      const { variants, quantityOffers, ...fields } = input;
      await tx.product.update({
        where: { id: existing.id },
        data: {
          ...fields,
          slug: input.title && input.title !== existing.title ? await this.uniqueSlug(ctx.storeId, input.title, existing.id) : undefined,
        },
      });
      if (variants) {
        for (const v of variants) {
          if (Object.keys(v.options).some((k) => !options.includes(k))) {
            throw new AppError('VALIDATION_ERROR', 'Option de variante inconnue');
          }
        }
        const keepIds = variants.map((v) => v.id).filter((x): x is string => !!x);
        await tx.productVariant.deleteMany({ where: { productId: existing.id, storeId: ctx.storeId, id: { notIn: keepIds } } });
        for (const [i, v] of variants.entries()) {
          const data = this.variantData(ctx.storeId, options, v, i);
          if (v.id && existing.variants.some((ev) => ev.id === v.id)) {
            await tx.productVariant.update({ where: { id: v.id }, data });
          } else {
            await tx.productVariant.create({ data: { ...data, productId: existing.id } });
          }
        }
      }
      if (quantityOffers) {
        await tx.quantityOffer.deleteMany({ where: { productId: existing.id, storeId: ctx.storeId } });
        if (quantityOffers.length) {
          await tx.quantityOffer.createMany({
            data: quantityOffers.map((o) => ({ storeId: ctx.storeId, productId: existing.id, quantity: o.quantity, price: o.price, label: o.label ?? null })),
          });
        }
      }
    });
    return this.get(ctx, id);
  }

  async duplicate(ctx: StoreContext, id: string): Promise<ProductDto> {
    const p = await this.findOwned(ctx, id);
    return this.create(ctx, {
      title: `${p.title} (copie)`,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      cost: p.cost,
      status: 'DRAFT',
      images: p.images,
      videoUrl: p.videoUrl,
      options: p.options,
      trackStock: p.trackStock,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      variants: p.variants.map((v) => ({ options: v.options as Record<string, string>, price: v.price, stock: v.stock, sku: v.sku })),
      quantityOffers: p.quantityOffers.map((o) => ({ quantity: o.quantity, price: o.price, label: o.label })),
    });
  }

  /** Products with orders are archived, never deleted, to keep order history intact. */
  async remove(ctx: StoreContext, id: string): Promise<{ archived: boolean }> {
    const p = await this.findOwned(ctx, id);
    const used = await this.prisma.orderItem.count({ where: { productId: p.id, storeId: ctx.storeId } });
    if (used > 0) {
      await this.prisma.product.update({ where: { id: p.id }, data: { status: 'ARCHIVED' } });
      return { archived: true };
    }
    try {
      await this.prisma.product.delete({ where: { id: p.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        await this.prisma.product.update({ where: { id: p.id }, data: { status: 'ARCHIVED' } });
        return { archived: true };
      }
      throw e;
    }
    return { archived: false };
  }
}
