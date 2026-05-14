import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './shared/observability/app-logger';
import { validateEnv } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const env = validateEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new AppLogger('Bootstrap');
  app.useLogger(logger);
  await app.listen(env.PORT);
  logger.log(`Backend running on port ${env.PORT}`);
}

void bootstrap();
