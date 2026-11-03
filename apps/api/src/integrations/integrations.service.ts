import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { IntegrationsDto, PixelsConfig, SheetsConfig } from '@myabeshop/shared';
import { PrismaService } from '../common/prisma.service';
import { decryptJson, encryptJson } from '../common/crypto';
import type { AuthUser, StoreContext } from '../common/request';
import { PlansService } from '../billing/plans.service';
import { QueueService } from '../jobs/queue.service';

type StoredSheets = { webhookUrl: string; active: boolean; lastError?: string | null; lastSyncAt?: string | null };
type StoredPixels = { metaPixelId?: string | null; tiktokPixelId?: string | null };

export interface SheetsRow {
  event: 'order.created' | 'order.updated';
  storeId: string;
  order: {
    number: number;
    date: string;
    status: string;
    customerName: string;
    customerPhone: string;
    city: string;
    address: string;
    items: string;
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
    currency: string;
    source: string | null;
    courier: string | null;
    note: string | null;
  };
}

/** Per-store integrations (§8.4): ad pixels and Google Sheets. Settings are encrypted at rest. */
@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger('Integrations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.queue.register('sheets.push', (data) => this.deliverToSheets(data as SheetsRow));
  }

  private async read<T>(storeId: string, type: string): Promise<T | null> {
    const row = await this.prisma.integration.findUnique({ where: { storeId_type: { storeId, type } } });
    if (!row) return null;
    return decryptJson<T>(row.config);
  }

  private async write(storeId: string, type: string, value: unknown, active = true) {
    const config = encryptJson(value);
    await this.prisma.integration.upsert({
      where: { storeId_type: { storeId, type } },
      create: { storeId, type, config, active },
      update: { config, active },
    });
  }

  async get(ctx: StoreContext): Promise<IntegrationsDto> {
    const [pixels, sheets, limits] = await Promise.all([
      this.read<StoredPixels>(ctx.storeId, 'pixels'),
      this.read<StoredSheets>(ctx.storeId, 'sheets'),
      this.plans.limits(ctx.storeId),
    ]);
    return {
      pixels: { metaPixelId: pixels?.metaPixelId ?? null, tiktokPixelId: pixels?.tiktokPixelId ?? null },
      sheets: { webhookUrl: sheets?.webhookUrl ?? null, active: sheets?.active ?? false, lastError: sheets?.lastError ?? null, lastSyncAt: sheets?.lastSyncAt ?? null },
      allowed: { pixels: limits.pixels, sheets: limits.sheets, promoCodes: limits.promoCodes },
    };
  }

  async setPixels(ctx: StoreContext, actor: AuthUser, input: PixelsConfig) {
    await this.plans.assertFeature(ctx.storeId, 'pixels');
    await this.write(ctx.storeId, 'pixels', { metaPixelId: input.metaPixelId || null, tiktokPixelId: input.tiktokPixelId || null });
    await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'integration.pixels' } });
    return this.get(ctx);
  }

  async setSheets(ctx: StoreContext, actor: AuthUser, input: SheetsConfig) {
    await this.plans.assertFeature(ctx.storeId, 'sheets');
    await this.write(ctx.storeId, 'sheets', { webhookUrl: input.webhookUrl, active: input.active, lastError: null, lastSyncAt: null }, input.active);
    await this.prisma.auditLog.create({ data: { storeId: ctx.storeId, actorId: actor.id, action: 'integration.sheets' } });
    return this.get(ctx);
  }

  async removeSheets(ctx: StoreContext) {
    await this.prisma.integration.deleteMany({ where: { storeId: ctx.storeId, type: 'sheets' } });
    return this.get(ctx);
  }

  /** Pixel ids for the storefront, only when the plan includes pixels. */
  async storefrontPixels(storeId: string, allowed: boolean) {
    if (!allowed) return { metaPixelId: null, tiktokPixelId: null };
    const p = await this.read<StoredPixels>(storeId, 'pixels');
    return { metaPixelId: p?.metaPixelId ?? null, tiktokPixelId: p?.tiktokPixelId ?? null };
  }

  /** Queues the order for the merchant's Google Sheet (no-op when not configured). */
  async pushOrder(row: SheetsRow) {
    const sheets = await this.read<StoredSheets>(row.storeId, 'sheets');
    if (!sheets?.active) return;
    if (!(await this.plans.hasFeature(row.storeId, 'sheets'))) return;
    await this.queue.add('sheets.push', row);
  }

  async sendTestRow(ctx: StoreContext) {
    await this.deliverToSheets({
      event: 'order.created',
      storeId: ctx.storeId,
      order: {
        number: 0, date: new Date().toISOString(), status: 'TEST', customerName: 'Test Myabéshop', customerPhone: '+22500000000', city: '—', address: '—',
        items: 'Ligne de test', subtotal: 0, deliveryFee: 0, discount: 0, total: 0, currency: ctx.currency, source: 'test', courier: null, note: null,
      },
    }).catch(() => undefined); // the error is saved as lastError and shown in the UI
    return this.get(ctx);
  }

  private async deliverToSheets(row: SheetsRow) {
    const sheets = await this.read<StoredSheets>(row.storeId, 'sheets');
    if (!sheets?.active) return;
    let error: string | null = null;
    try {
      const res = await fetch(sheets.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).message.slice(0, 200);
    }
    await this.write(row.storeId, 'sheets', { ...sheets, lastError: error, lastSyncAt: new Date().toISOString() }, sheets.active);
    if (error) {
      this.logger.warn(`Google Sheets (${row.storeId}): ${error}`);
      throw new Error(error); // retried by the queue
    }
  }
}
