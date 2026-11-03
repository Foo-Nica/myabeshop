import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { adSpendSchema, statsReportQuerySchema, type AdSpendInput, type DashboardStats, type StatsReportQuery } from '@myabeshop/shared';
import { CurrentStore, RequirePermission } from '../common/decorators';
import { ApiZodBody, ZodPipe } from '../common/zod';
import { PrismaService } from '../common/prisma.service';
import type { StoreContext } from '../common/request';
import { StatsService } from './stats.service';

const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stores/:storeId/stats')
export class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
  ) {}

  /** Dashboard (§8.3): today's orders, cash collected, cash pending, confirmation and delivery rates. */
  @Get()
  @RequirePermission('stats.read')
  async dashboard(@CurrentStore() ctx: StoreContext, @Query(new ZodPipe(query)) q: { days: number }): Promise<DashboardStats> {
    const since = new Date(Date.now() - q.days * 86_400_000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const where = { storeId: ctx.storeId, createdAt: { gte: since } };
    const [grouped, ordersToday, delivered, pending] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.count({ where: { storeId: ctx.storeId, createdAt: { gte: startOfDay } } }),
      this.prisma.order.aggregate({ where: { ...where, status: 'DELIVERED' }, _sum: { total: true } }),
      this.prisma.courier.aggregate({ where: { storeId: ctx.storeId }, _sum: { cashBalance: true } }),
    ]);
    const byStatus = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as DashboardStats['byStatus'];
    const n = (s: keyof typeof byStatus) => byStatus[s] ?? 0;
    const received = Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0);
    const confirmed = n('CONFIRMED') + n('SHIPPED') + n('POSTPONED') + n('DELIVERED') + n('REFUSED') + n('RETURNED');
    const shipped = n('SHIPPED') + n('POSTPONED') + n('DELIVERED') + n('REFUSED') + n('RETURNED');
    return {
      currency: ctx.currency,
      ordersToday,
      ordersPeriod: received,
      confirmationRate: received ? Math.round((confirmed / received) * 100) : null,
      deliveryRate: shipped ? Math.round((n('DELIVERED') / shipped) * 100) : null,
      revenueCollected: delivered._sum.total ?? 0,
      cashPending: pending._sum.cashBalance ?? 0,
      byStatus,
    };
  }

  /** Full report: rates, estimated profit, breakdown by product, city, courier, agent and source. */
  @Get('report')
  @RequirePermission('stats.read')
  report(@CurrentStore() ctx: StoreContext, @Query(new ZodPipe(statsReportQuerySchema)) q: StatsReportQuery) {
    return this.stats.report(ctx, q.from, q.to);
  }

  @Get('orders.csv')
  @RequirePermission('stats.read')
  async csv(@CurrentStore() ctx: StoreContext, @Query(new ZodPipe(statsReportQuerySchema)) q: StatsReportQuery, @Res() res: Response) {
    const csv = await this.stats.ordersCsv(ctx, q.from, q.to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="commandes-${ctx.slug}-${q.from ?? 'debut'}-${q.to ?? 'aujourdhui'}.csv"`);
    res.send(csv);
  }

  @Post('ad-spends')
  @RequirePermission('stats.read')
  @ApiZodBody(adSpendSchema)
  addSpend(@CurrentStore() ctx: StoreContext, @Body(new ZodPipe(adSpendSchema)) body: AdSpendInput) {
    return this.stats.addSpend(ctx, body);
  }

  @Delete('ad-spends/:id')
  @HttpCode(204)
  @RequirePermission('stats.read')
  async removeSpend(@CurrentStore() ctx: StoreContext, @Param('id') id: string) {
    await this.stats.removeSpend(ctx, id);
  }
}
