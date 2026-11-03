import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { config } from './common/config';
import { PrismaService } from './common/prisma.service';
import { PrismaModule } from './common/prisma.module';
import { JwtAuthGuard } from './common/auth.guard';
import { StoreGuard } from './common/store.guard';
import { Public } from './common/decorators';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { StoresController } from './stores/stores.controller';
import { StoresService } from './stores/stores.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { ZonesController } from './zones/zones.controller';
import { ZonesService } from './zones/zones.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { CouriersController } from './couriers/couriers.controller';
import { CouriersService } from './couriers/couriers.service';
import { PublicController } from './public/public.controller';
import { StatsController } from './stats/stats.controller';
import { UploadsController } from './uploads/uploads.controller';

@Controller()
class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

@Module({
  imports: [
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: config.jwtSecret }) }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    PrismaModule,
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    StoresController,
    ProductsController,
    ZonesController,
    OrdersController,
    CouriersController,
    PublicController,
    StatsController,
    UploadsController,
  ],
  providers: [
    AuthService,
    StoresService,
    ProductsService,
    ZonesService,
    OrdersService,
    CouriersService,
    // Order matters: rate limit, then authenticate, then check store membership and role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: StoreGuard },
  ],
})
export class AppModule {}
