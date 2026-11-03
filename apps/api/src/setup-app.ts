import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { config } from './common/config';

/** Shared by main.ts and the e2e tests so both run the same HTTP stack. */
export function setupApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  express.enableCors({ origin: config.corsOrigins, credentials: true });
  express.useStaticAssets(config.uploadDir, { prefix: '/uploads/', maxAge: '30d', immutable: true });
  express.useBodyParser('json', { limit: '1mb' });
}
