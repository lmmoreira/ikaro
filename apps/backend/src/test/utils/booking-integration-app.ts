import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ModuleMetadata } from '@nestjs/common';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { TenantInterceptor } from '../../shared/tenant/tenant.interceptor';
import { TenantModule } from '../../shared/tenant/tenant.module';
import { BookingEntity } from '../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../contexts/booking/infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from '../../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../../contexts/booking/infrastructure/entities/service.entity';
import { BookingModule } from '../../contexts/booking/booking.module';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { InMemoryEventBus } from '../infrastructure/in-memory-event-bus';

export interface BookingIntegrationAppOptions {
  extraModules?: NonNullable<ModuleMetadata['imports']>;
  overrideEventBus?: boolean;
}

export async function createBookingIntegrationApp(
  options: BookingIntegrationAppOptions = {},
): Promise<{ app: INestApplication; ds: DataSource }> {
  const { extraModules = [], overrideEventBus = false } = options;

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [
          TenantEntity,
          HotsiteConfigEntity,
          ServiceEntity,
          ScheduleClosureEntity,
          ScheduleOpeningEntity,
          BookingEntity,
          BookingLineEntity,
        ],
        synchronize: false,
      }),
      TransactionManagerModule,
      TenantModule,
      BookingModule,
      ...extraModules,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
  });

  if (overrideEventBus) {
    builder = builder.overrideProvider(EVENT_BUS).useValue(new InMemoryEventBus());
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
