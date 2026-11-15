import { INestApplication } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BillingModule } from '../../contexts/billing/billing.module';
import { DevClockModule } from '../../contexts/billing/infrastructure/dev-clock.module';
import { BillingAccountEntity } from '../../contexts/billing/infrastructure/entities/billing-account.entity';
import { FeaturePriceVersionEntity } from '../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../contexts/billing/infrastructure/entities/feature-price.entity';
import { OperatorAuditEntity } from '../../contexts/billing/infrastructure/entities/operator-audit.entity';
import { SignupRegistrationEntity } from '../../contexts/billing/infrastructure/entities/signup-registration.entity';
import { SubscriptionItemEntity } from '../../contexts/billing/infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from '../../contexts/billing/infrastructure/entities/subscription.entity';
import { FRONTEND_REVALIDATION_PORT } from '../../contexts/platform/application/ports/frontend-revalidation.port';
import { ChatbotMessageEntity } from '../../contexts/platform/infrastructure/entities/chatbot-message.entity';
import { ChatbotProviderBalanceEntity } from '../../contexts/platform/infrastructure/entities/chatbot-provider-balance.entity';
import { ChatbotSessionEntity } from '../../contexts/platform/infrastructure/entities/chatbot-session.entity';
import { HotsiteConfigEntity } from '../../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { LeadFormAnswerEntity } from '../../contexts/platform/infrastructure/entities/lead-form-answer.entity';
import { LeadFormConfigEntity } from '../../contexts/platform/infrastructure/entities/lead-form-config.entity';
import { LeadFormSubmissionEntity } from '../../contexts/platform/infrastructure/entities/lead-form-submission.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../contexts/platform/platform.module';
import { AppEnv } from '../../shared/database/resolve-app-env';
import { ClockModule } from '../../shared/infrastructure/clock/clock.module';
import { InboxModule } from '../../shared/infrastructure/inbox/inbox.module';
import { InboxRecordEntity } from '../../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxModule } from '../../shared/infrastructure/outbox/outbox.module';
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS_TRANSPORT } from '../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../shared/ports/outbox-publisher.port';
import { STORAGE_SERVICE } from '../../shared/ports/storage.service.port';
import { RequestInterceptor } from '../../shared/request/request.interceptor';
import { RequestModule } from '../../shared/request/request.module';
import { InMemoryFrontendRevalidationPort } from '../infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryStorageService } from '../infrastructure/in-memory-storage.service';
import { RoutingInMemoryEventBus } from '../infrastructure/routing-in-memory-event-bus';
import { testCacheModule } from './test-cache-module';
import { testConfigModule } from './test-config-module';

export interface SuspendedExperienceApp {
  app: INestApplication;
  ds: DataSource;
  /** The transport under the real `GatedEventBus`: every delivery that passes the gate lands here. */
  transport: RoutingInMemoryEventBus;
  revalidation: InMemoryFrontendRevalidationPort;
}

/**
 * Boots the real Billing and Platform modules together (M25-S26's golden path): the real access
 * port and operator routes, the real hotsite manifest and revalidation handlers, and the real
 * `GatedEventBus` (the `EVENT_BUS` provider is deliberately not overridden) over an in-process
 * transport, so a suspended tenant's gated delivery is decided by the real access answer.
 */
export async function createSuspendedExperienceApp(
  extraProviders: Provider[] = [],
  appEnv: AppEnv = 'local',
): Promise<SuspendedExperienceApp> {
  const transport = new RoutingInMemoryEventBus();
  const revalidation = new InMemoryFrontendRevalidationPort();

  const moduleRef = await Test.createTestingModule({
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
          OperatorAuditEntity,
          InboxRecordEntity,
          TenantEntity,
          HotsiteConfigEntity,
          LeadFormConfigEntity,
          LeadFormSubmissionEntity,
          LeadFormAnswerEntity,
          ChatbotSessionEntity,
          ChatbotMessageEntity,
          ChatbotProviderBalanceEntity,
        ],
        synchronize: false,
      }),
      EventBusModule,
      OutboxModule,
      InboxModule,
      TransactionManagerModule,
      RequestModule,
      ClockModule.register(appEnv),
      DevClockModule.register(appEnv),
      BillingModule,
      PlatformModule,
    ],
    providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }, ...extraProviders],
  })
    .overrideProvider(EVENT_BUS_TRANSPORT)
    .useValue(transport)
    .overrideProvider(OUTBOX_PUBLISHER)
    .useValue(transport)
    .overrideProvider(FRONTEND_REVALIDATION_PORT)
    .useValue(revalidation)
    .overrideProvider(STORAGE_SERVICE)
    .useValue(new InMemoryStorageService())
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource), transport, revalidation };
}
