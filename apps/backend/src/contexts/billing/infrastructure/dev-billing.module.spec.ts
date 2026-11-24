import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BILLING_FAKE_PROVIDER_CONTROL } from '../application/ports/billing-fake-provider-control.port';
import { CHARGE_REPOSITORY } from '../application/ports/charge-repository.port';
import { ProviderWebhookProcessor } from '../application/services/provider-webhook-processor.service';
import { SimulateProviderEventUseCase } from '../application/use-cases/simulate-provider-event.use-case';
import { testConfigModule } from '../../../test/utils/test-config-module';
import { InMemoryChargeRepository } from '../../../test/repositories/billing/in-memory-charge.repository';
import { AdvanceableClock } from '../../../test/infrastructure/advanceable-clock';
import { InternalDevBillingController } from './controllers/internal-dev-billing.controller';
import { DevBillingModule } from './dev-billing.module';
import { FakeBillingProvider } from './providers/fake-billing.provider';

// Stands in for the `@Global()` `BillingModule` exports `DevBillingModule` resolves through.
const fake = new FakeBillingProvider(new AdvanceableClock(new Date('2026-03-10T15:00:00Z')));
@Global()
@Module({
  providers: [
    { provide: CHARGE_REPOSITORY, useValue: new InMemoryChargeRepository() },
    { provide: FakeBillingProvider, useValue: fake },
    { provide: ProviderWebhookProcessor, useValue: { execute: async () => 'APPLIED' } },
  ],
  exports: [CHARGE_REPOSITORY, FakeBillingProvider, ProviderWebhookProcessor],
})
class BillingExportsStub {}

async function build(appEnv: 'local' | 'staging' | 'production') {
  return Test.createTestingModule({
    imports: [testConfigModule(), BillingExportsStub, DevBillingModule.register(appEnv)],
  }).compile();
}

describe('DevBillingModule.register', () => {
  it.each(['local', 'staging'] as const)(
    'provides the controller, the use case and the fake control in %s',
    async (env) => {
      const moduleRef = await build(env);

      expect(moduleRef.get(InternalDevBillingController)).toBeDefined();
      expect(moduleRef.get(SimulateProviderEventUseCase)).toBeDefined();
      expect(moduleRef.get(BILLING_FAKE_PROVIDER_CONTROL)).toBe(fake);
    },
  );

  it('provides no controller, use case or fake control in production', async () => {
    const moduleRef = await build('production');

    expect(() => moduleRef.get(InternalDevBillingController)).toThrow();
    expect(() => moduleRef.get(SimulateProviderEventUseCase)).toThrow();
    expect(() => moduleRef.get(BILLING_FAKE_PROVIDER_CONTROL)).toThrow();
  });
});
