import 'reflect-metadata';

// Load apps/api/.env when present (Node 22 built-in, no dotenv dependency).
try {
  process.loadEnvFile();
} catch {
  /* no .env file: rely on the real environment */
}
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { config } from './common/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  const doc = new DocumentBuilder()
    .setTitle('Myabéshop API')
    .setDescription('API de la plateforme e-commerce COD : boutiques, produits, commandes, livraisons.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'docs/openapi.json' });
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`API prête sur http://localhost:${config.port} (docs : /docs)`, 'Bootstrap');
}
void bootstrap();
