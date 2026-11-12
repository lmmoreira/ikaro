import { INestApplication } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeaturePriceVersionEntity } from '../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../contexts/billing/infrastructure/entities/feature-price.entity';
import { BillingAccountEntity } from '../../contexts/billing/infrastructure/entities/billing-account.entity';
import { SignupRegistrationEntity } from '../../contexts/billing/infrastructure/entities/signup-registration.entity';
import { SubscriptionItemEntity } from '../../contexts/billing/infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../contexts/billing/infrastructure/entities/subscription.entity';
import { BillingModule } from '../../contexts/billing/billing.module';
import { DevClockModule } from '../../contexts/billing/infrastructure/dev-clock.module';
import { AppEnv } from '../../shared/database/resolve-app-env';
import { ClockModule } from '../../shared/infrastructure/clock/clock.module';
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { InboxModule } from '../../shared/infrastructure/inbox/inbox.module';
import { InboxRecordEntity } from '../../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxModule } from '../../shared/infrastructure/outbox/outbox.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../shared/ports/outbox-publisher.port';
import { RoutingInMemoryEventBus } from '../infrastructure/routing-in-memory-event-bus';
import { testCacheModule } from './test-cache-module';
import { testConfigModule } from './test-config-module';

export interface BillingIntegrationAppOptions {
  extraProviders?: Provider[];
  overrideProviders?: Array<{ provide: symbol | string; useValue: unknown }>;
  /** The `APP_ENV` the clock modules are registered for (default `local`). */
  appEnv?: AppEnv;
}

/**
 * Boots only the Billing context against the shared Testcontainers database. Every Billing entity
 * story registers its entities in `entities` below and in the architecture policy's
 * `testDataHarnessRegistrations` entry for this file.
 */
export async function createBillingIntegrationApp(
  options: BillingIntegrationAppOptions = {},
): Promise<{ app: INestApplication; ds: DataSource; eventBus: RoutingInMemoryEventBus }> {
  const { extraProviders = [], overrideProviders = [], appEnv = 'local' } = options;

  // The in-process bus delivers synchronously and swallows handler errors (like Pub/Sub's
  // fire-and-forget publish), so a spec that needs a handler's failure calls the handler itself.
  const routingBus = new RoutingInMemoryEventBus();

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports: [
      testConfigModule(),
      testCacheModule(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [
          FeaturePriceEntity,
          FeaturePriceVersionEntity,
          SubscriptionEntity,
          SubscriptionItemEntity,
          BillingAccountEntity,
          SignupRegistrationEntity,
          InboxRecordEntity,
        ],
        synchronize: false,
      }),
      EventBusModule,
      OutboxModule,
      InboxModule,
      TransactionManagerModule,
      ClockModule.register(appEnv),
      DevClockModule.register(appEnv),
      BillingModule,
    ],
    providers: extraProviders,
  })
    .overrideProvider(EVENT_BUS)
    .useValue(routingBus)
    .overrideProvider(OUTBOX_PUBLISHER)
    .useValue(routingBus);

  for (const { provide, useValue } of overrideProviders) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource), eventBus: routingBus };
}
