import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { ModuleMetadata } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { StaffEntity } from '../../contexts/staff/infrastructure/entities/staff.entity';
import { StaffModule } from '../../contexts/staff/staff.module';
import { NOTIFICATION_DISPATCHER } from '../../contexts/notification/application/ports/notification-dispatcher.port';
import { NotificationLogEntity } from '../../contexts/notification/infrastructure/entities/notification-log.entity';
import { NotificationProcessedEventEntity } from '../../contexts/notification/infrastructure/entities/processed-event.entity';
import { NotificationTemplateEntity } from '../../contexts/notification/infrastructure/entities/notification-template.entity';
import { NotificationModule } from '../../contexts/notification/notification.module';
import { InMemoryNotificationDispatcher } from '../infrastructure/in-memory-notification-dispatcher';
import { EVENT_BUS, IEventBus } from '../../shared/ports/event-bus.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { RoutingInMemoryEventBus } from '../infrastructure/routing-in-memory-event-bus';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { InMemoryTenantSettingsPort } from '../infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { testCacheModule } from './test-cache-module';

type EntityClass = abstract new (...args: unknown[]) => unknown;

export interface NotificationIntegrationAppOptions {
  dispatcher: InMemoryNotificationDispatcher;
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  extraModules?: NonNullable<ModuleMetadata['imports']>;
  extraEntities?: EntityClass[];
  withRequestInterceptor?: boolean;
}

export async function createNotificationIntegrationApp(
  options: NotificationIntegrationAppOptions,
): Promise<{ app: INestApplication; ds: DataSource; eventBus: IEventBus }> {
  const {
    dispatcher,
    configure,
    extraModules = [],
    extraEntities = [],
    withRequestInterceptor = false,
  } = options;

  const routingBus = new RoutingInMemoryEventBus();

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      testCacheModule(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [
          TenantEntity,
          HotsiteConfigEntity,
          StaffEntity,
          NotificationLogEntity,
          NotificationProcessedEventEntity,
          NotificationTemplateEntity,
          ...extraEntities,
        ],
        synchronize: false,
      }),
      EventBusModule,
      TransactionManagerModule,
      PlatformModule,
      StaffModule,
      NotificationModule,
      ...(withRequestInterceptor ? [RequestModule] : []),
      ...extraModules,
    ],
    providers: withRequestInterceptor
      ? [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }]
      : [],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(routingBus)
    .overrideProvider(NOTIFICATION_DISPATCHER)
    .useValue(dispatcher)
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService())
    .overrideProvider(TENANT_SETTINGS_PORT)
    .useValue(new InMemoryTenantSettingsPort());

  if (configure) {
    builder = configure(builder);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource), eventBus: moduleRef.get<IEventBus>(EVENT_BUS) };
}
