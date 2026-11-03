import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Rust-free Prisma client (engineType = "client"): queries go through the `pg`
 * driver, so deployments do not need a native query engine binary.
 */
export function createPrismaClient(url = process.env.DATABASE_URL) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
