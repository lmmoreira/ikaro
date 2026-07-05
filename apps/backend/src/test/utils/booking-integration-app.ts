import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ModuleMetadata } from '@nestjs/common';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { BookingEntity } from '../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../contexts/booking/infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from '../../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../../contexts/booking/infrastructure/entities/service.entity';
import { BookingModule } from '../../contexts/booking/booking.module';
import { CustomerEntity } from '../../contexts/customer/infrastructure/entities/customer.entity';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { RoutingInMemoryEventBus } from '../infrastructure/routing-in-memory-event-bus';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { InMemoryTenantSettingsPort } from '../infrastructure/in-memory-tenant-settings.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';

export interface BookingIntegrationAppOptions {
  extraModules?: NonNullable<ModuleMetadata['imports']>;
  overrideProviders?: Array<{ provide: symbol | string; useValue: unknown }>;
}

export async function createBookingIntegrationApp(
  options: BookingIntegrationAppOptions = {},
): Promise<{ app: INestApplication; ds: DataSource; eventBus: RoutingInMemoryEventBus }> {
  const { extraModules = [], overrideProviders = [] } = options;

  const routingBus = new RoutingInMemoryEventBus();

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      CacheModule.register({
        isGlobal: true,
        ttl: 60_000,
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [
          TenantEntity,
          HotsiteConfigEntity,
          CustomerEntity,
          ServiceEntity,
          ScheduleClosureEntity,
          ScheduleOpeningEntity,
          BookingEntity,
          BookingLineEntity,
        ],
        synchronize: false,
      }),
      EventBusModule,
      TransactionManagerModule,
      RequestModule,
      BookingModule,
      ...extraModules,
    ],
    providers: [
      { provide: APP_INTERCEPTOR, useClass: RequestInterceptor },
      { provide: TENANT_SETTINGS_PORT, useClass: InMemoryTenantSettingsPort },
    ],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(routingBus)
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService());

  for (const { provide, useValue } of overrideProviders) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource), eventBus: routingBus };
}
