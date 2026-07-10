import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { BalanceExpiryLogEntity } from '../../contexts/loyalty/infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../../contexts/loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../../contexts/loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../../contexts/loyalty/infrastructure/entities/loyalty-redemption.entity';
import { ProcessedEventEntity } from '../../contexts/loyalty/infrastructure/entities/processed-event.entity';
import { LOYALTY_BOOKING_PORT } from '../../contexts/loyalty/application/ports/loyalty-booking.port';
import { LoyaltyModule } from '../../contexts/loyalty/loyalty.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { RoutingInMemoryEventBus } from '../infrastructure/routing-in-memory-event-bus';
import { InMemoryLoyaltyBookingPort } from '../infrastructure/in-memory-loyalty-booking.port';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { InMemoryTenantSettingsPort } from '../infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../shared/ports/tenant-settings.port';
import { testCacheModule } from './test-cache-module';

export interface LoyaltyIntegrationAppResult {
  app: INestApplication;
  ds: DataSource;
  serviceCatalog: InMemoryLoyaltyBookingPort;
  eventBus: RoutingInMemoryEventBus;
}

export async function createLoyaltyIntegrationApp(): Promise<LoyaltyIntegrationAppResult> {
  const serviceCatalog = new InMemoryLoyaltyBookingPort();
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
          LoyaltyEntryEntity,
          LoyaltyBalanceEntity,
          LoyaltyRedemptionEntity,
          BalanceExpiryLogEntity,
          ProcessedEventEntity,
        ],
        synchronize: false,
      }),
      TransactionManagerModule,
      RequestModule,
      EventBusModule,
      PlatformModule,
      LoyaltyModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }],
  });

  builder = builder
    .overrideProvider(EVENT_BUS)
    .useValue(routingBus)
    .overrideProvider(LOYALTY_BOOKING_PORT)
    .useValue(serviceCatalog)
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService())
    .overrideProvider(TENANT_SETTINGS_PORT)
    .useValue(new InMemoryTenantSettingsPort());

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return { app, ds: moduleRef.get(DataSource), serviceCatalog, eventBus: routingBus };
}
