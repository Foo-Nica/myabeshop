import { HttpStatus, Injectable } from '@nestjs/common';
import type { DeliveryZone } from '@prisma/client';
import type { ZoneDto, ZoneInput } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { AppError } from '../common/errors';
import type { StoreContext } from '../common/request';

export function toZoneDto(z: DeliveryZone): ZoneDto {
  return { id: z.id, name: z.name, city: z.city, fee: z.fee, freeAbove: z.freeAbove, delay: z.delay, active: z.active, position: z.position };
}

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(storeId: string): Promise<ZoneDto[]> {
    const zones = await this.prisma.deliveryZone.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    return zones.map(toZoneDto);
  }

  async create(ctx: StoreContext, input: ZoneInput): Promise<ZoneDto> {
    const zone = await this.prisma.deliveryZone.create({ data: { ...input, freeAbove: input.freeAbove ?? null, delay: input.delay ?? null, storeId: ctx.storeId } });
    return toZoneDto(zone);
  }

  async createMany(ctx: StoreContext, inputs: ZoneInput[]): Promise<ZoneDto[]> {
    for (const z of inputs) await this.create(ctx, z);
    return this.list(ctx.storeId);
  }

  async update(ctx: StoreContext, id: string, input: Partial<ZoneInput>): Promise<ZoneDto> {
    const res = await this.prisma.deliveryZone.updateMany({ where: { id, storeId: ctx.storeId }, data: input });
    if (res.count === 0) throw new AppError('ZONE_NOT_FOUND', 'Zone introuvable', HttpStatus.NOT_FOUND);
    return toZoneDto(await this.prisma.deliveryZone.findUniqueOrThrow({ where: { id } }));
  }

  async remove(ctx: StoreContext, id: string): Promise<void> {
    const res = await this.prisma.deliveryZone.deleteMany({ where: { id, storeId: ctx.storeId } });
    if (res.count === 0) throw new AppError('ZONE_NOT_FOUND', 'Zone introuvable', HttpStatus.NOT_FOUND);
  }
}
