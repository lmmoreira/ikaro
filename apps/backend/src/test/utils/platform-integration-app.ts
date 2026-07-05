import { INestApplication } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { FRONTEND_REVALIDATION_PORT } from '../../contexts/platform/application/ports/frontend-revalidation.port';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { InMemoryEventBus } from '../infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { InMemoryFrontendRevalidationPort } from '../infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryTenantSettingsPort } from '../infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { testCacheModule } from './test-cache-module';

export interface PlatformIntegrationAppOptions {
  extraProviders?: Provider[];
  overrideProviders?: Array<{ provide: symbol | string; useValue: unknown }>;
}

export async function createPlatformIntegrationApp(
  options: PlatformIntegrationAppOptions = {},
): Promise<{ app: INestApplication; ds: DataSource }> {
  const { extraProviders = [], overrideProviders = [] } = options;

  let builder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      testCacheModule(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [TenantEntity, HotsiteConfigEntity],
        synchronize: false,
      }),
      TransactionManagerModule,
      RequestModule,
      EventBusModule,
      PlatformModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }, ...extraProviders],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(new InMemoryEventBus())
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService())
    .overrideProvider(FRONTEND_REVALIDATION_PORT)
    .useValue(new InMemoryFrontendRevalidationPort())
    .overrideProvider(TENANT_SETTINGS_PORT)
    .useValue(new InMemoryTenantSettingsPort());

  for (const { provide, useValue } of overrideProviders) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
