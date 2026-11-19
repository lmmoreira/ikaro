import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppLogger } from './shared/observability/app-logger';
import { applyBodyLimits } from './shared/http/body-limits';
import { applySecurityHeaders } from './shared/http/security-headers';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new AppLogger('Bootstrap');
  app.useLogger(logger);

  const config = app.get(ConfigService);

  applySecurityHeaders(app);

  applyBodyLimits(app);

  app.enableCors({
    origin: config.getOrThrow<string>('ALLOWED_ORIGINS').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Correlation-ID'],
  });

  app.setGlobalPrefix('v1');

  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`BFF running on port ${port}`);
}

void bootstrap();
