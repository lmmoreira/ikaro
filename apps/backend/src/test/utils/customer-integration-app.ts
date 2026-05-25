import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { TenantInterceptor } from '../../shared/tenant/tenant.interceptor';
import { TenantModule } from '../../shared/tenant/tenant.module';
import { CustomerEntity } from '../../contexts/customer/infrastructure/entities/customer.entity';
import { CustomerModule } from '../../contexts/customer/customer.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { InMemoryEventBus } from '../infrastructure/in-memory-event-bus';

export async function createCustomerIntegrationApp(): Promise<{
  app: INestApplication;
  ds: DataSource;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [TenantEntity, HotsiteConfigEntity, CustomerEntity],
        synchronize: false,
      }),
      TransactionManagerModule,
      TenantModule,
      EventBusModule,
      PlatformModule,
      CustomerModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
  })
    .overrideProvider(EVENT_BUS)
    .useValue(new InMemoryEventBus())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
