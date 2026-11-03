import { Global, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../common/config';

export type JobName = 'message.send' | 'sheets.push';
type Handler = (data: unknown) => Promise<void>;

/**
 * Background jobs (SMS, WhatsApp, Google Sheets…) so a slow provider never blocks the API.
 * With REDIS_URL set, jobs go through a BullMQ queue with retries and exponential back-off;
 * without Redis (local dev, tests) they run in-process right away, with the same handlers.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<JobName, Handler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  register(name: JobName, handler: Handler) {
    this.handlers.set(name, handler);
  }

  get mode() {
    return this.queue ? 'bullmq' : 'inline';
  }

  async onModuleInit() {
    const url = config.redisUrl;
    if (!url || process.env.NODE_ENV === 'test') return;
    const connection = { url, maxRetriesPerRequest: null } as const;
    this.queue = new Queue('outbound', { connection });
    if (process.env.QUEUE_WORKER !== 'off') {
      this.worker = new Worker('outbound', (job: Job) => this.run(job.name as JobName, job.data), { connection, concurrency: 10 });
      this.worker.on('failed', (job, err) => this.logger.warn(`${job?.name} #${job?.id} failed (${job?.attemptsMade}): ${err.message}`));
    }
    this.logger.log('BullMQ queue "outbound" ready');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async add(name: JobName, data: unknown): Promise<void> {
    if (this.queue) {
      await this.queue.add(name, data, { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 });
      return;
    }
    try {
      await this.run(name, data);
    } catch (e) {
      this.logger.warn(`${name} failed: ${(e as Error).message}`);
    }
  }

  private async run(name: JobName, data: unknown) {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No handler for job ${name}`);
    await handler(data);
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class JobsModule {}
