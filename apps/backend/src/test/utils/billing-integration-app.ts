import { INestApplication } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FeaturePriceVersionEntity } from '../../contexts/billing/infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../../contexts/billing/infrastructure/entities/feature-price.entity';
import { BillingModule } from '../../contexts/billing/billing.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { testCacheModule } from './test-cache-module';
import { testConfigModule } from './test-config-module';

export interface BillingIntegrationAppOptions {
  extraProviders?: Provider[];
  overrideProviders?: Array<{ provide: symbol | string; useValue: unknown }>;
}

/**
 * Boots only the Billing context against the shared Testcontainers database. Every Billing entity
 * story registers its entities in `entities` below and in the architecture policy's
 * `testDataHarnessRegistrations` entry for this file.
 */
export async function createBillingIntegrationApp(
  options: BillingIntegrationAppOptions = {},
): Promise<{ app: INestApplication; ds: DataSource }> {
  const { extraProviders = [], overrideProviders = [] } = options;

  let builder = Test.createTestingModule({
    imports: [
      testConfigModule(),
      testCacheModule(),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [FeaturePriceEntity, FeaturePriceVersionEntity],
        synchronize: false,
      }),
      TransactionManagerModule,
      BillingModule,
    ],
    providers: extraProviders,
  });

  for (const { provide, useValue } of overrideProviders) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, ds: moduleRef.get(DataSource) };
}
