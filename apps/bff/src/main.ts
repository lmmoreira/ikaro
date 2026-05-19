import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AppLogger } from './shared/observability/app-logger';
export { JWT_COOKIE_OPTIONS } from './auth/cookie-options';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new AppLogger('Bootstrap');
  app.useLogger(logger);

  const config = app.get(ConfigService);

  // Body size limits — 10 MB covers high-quality phone photos
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.enableCors({
    origin: config.getOrThrow<string>('ALLOWED_ORIGINS').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Correlation-ID'],
  });

  app.setGlobalPrefix('v1');

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`BFF running on port ${port}`);
}

void bootstrap();
