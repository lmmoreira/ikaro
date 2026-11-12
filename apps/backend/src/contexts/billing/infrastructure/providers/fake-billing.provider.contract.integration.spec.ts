import { INestApplication } from '@nestjs/common';
import { runBillingProviderContract } from '../../../../test/contracts/billing-provider.contract';
import {
  FAKE_CONTRACT_CAPABILITIES,
  fakeBillingHarness,
} from '../../../../test/contracts/fake-billing-provider.harness';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { CLOCK, IClock } from '../../../../shared/ports/clock.port';
import {
  BILLING_PROVIDER_REGISTRY,
  BillingProviderRegistryPort,
} from '../../application/ports/billing-provider.port';
import { ProviderNotSupportedError } from '../../domain/errors/billing-provider.errors';
import { BillingProviderRegistry } from './billing-provider.registry';
import { FakeBillingProvider } from './fake-billing.provider';

describe('BillingProviderRegistry wiring (integration)', () => {
  let app: INestApplication;
  let registry: BillingProviderRegistryPort;
  let clock: IClock;

  beforeAll(async () => {
    ({ app } = await createBillingIntegrationApp());
    registry = app.get<BillingProviderRegistryPort>(BILLING_PROVIDER_REGISTRY, { strict: false });
    clock = app.get<IClock>(CLOCK, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('binds the registry token to BillingProviderRegistry with useClass', () => {
    expect(registry).toBeInstanceOf(BillingProviderRegistry);
  });

  it('serves BRL_FAKE with the fake and has no adapter for USD_FAKE', () => {
    expect(registry.resolve('BRL_FAKE')).toBeInstanceOf(FakeBillingProvider);
    expect(() => registry.resolve('USD_FAKE')).toThrow(ProviderNotSupportedError);
  });

  runBillingProviderContract(
    'FakeBillingProvider resolved through the registry',
    async () => {
      // The registry hands out one shared fake, so each case starts from a clean scenario state:
      // a case that failed while the queue was paused must not leave the next ones paused.
      const fake = registry.resolve('BRL_FAKE') as FakeBillingProvider;
      await fake.reenableWebhookQueue('BRL_FAKE');
      fake.drainDeliveries();
      return fakeBillingHarness(fake, clock);
    },
    FAKE_CONTRACT_CAPABILITIES,
  );
});
