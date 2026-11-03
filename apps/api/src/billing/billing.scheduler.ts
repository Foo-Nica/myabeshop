import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { config } from '../common/config';
import { BillingService } from './billing.service';

/** Hourly subscription lifecycle (grace period, downgrade). Several API instances are safe: every step is idempotent. */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('BillingScheduler');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly billing: BillingService) {}

  onApplicationBootstrap() {
    if (!config.schedulerEnabled) return;
    const tick = () =>
      this.billing
        .runLifecycle()
        .then((r) => r.stores && this.logger.log(`Cycle abonnements : ${JSON.stringify(r)}`))
        .catch((e) => this.logger.error(e));
    setTimeout(tick, 10_000);
    this.timer = setInterval(tick, 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
