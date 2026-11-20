import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NO_FEATURE_GATE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemoryProviderEventRepository } from '../../../../test/repositories/billing/in-memory-provider-event.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import {
  WEBHOOK_PROVIDER_BY_SLUG,
  WebhookProviderSlugSchema,
} from '../../application/dtos/provider-webhook.dto';
import { ApplyChargeFactService } from '../../application/services/apply-charge-fact.service';
import { ProcessProviderWebhookUseCase } from '../../application/use-cases/process-provider-webhook.use-case';
import { BillingProviderRegistry } from '../providers/billing-provider.registry';
import { FakeBillingProvider } from '../providers/fake-billing.provider';
import { InternalBillingWebhookController } from './internal-billing-webhook.controller';

const NOW = new Date('2026-03-10T15:00:00Z');

function buildController(fake: FakeBillingProvider): InternalBillingWebhookController {
  const clock = new AdvanceableClock(NOW);
  const txManager = new InMemoryTransactionManager();
  const subscriptions = new InMemorySubscriptionRepository();
  const charges = new InMemoryChargeRepository();
  const providerEvents = new InMemoryProviderEventRepository();
  const applyFact = new ApplyChargeFactService(
    subscriptions,
    charges,
    providerEvents,
    new InMemoryFeaturePriceRepository(),
    txManager,
    clock,
  );
  return new InternalBillingWebhookController(
    new ProcessProviderWebhookUseCase(
      new BillingProviderRegistry('local', fake),
      { appEnv: 'local', platformOwnerSlug: null },
      new InMemoryBillingAccountRepository(),
      subscriptions,
      charges,
      providerEvents,
      applyFact,
      clock,
    ),
  );
}

describe('InternalBillingWebhookController', () => {
  const handler = InternalBillingWebhookController.prototype.receive;
  const reflector = new Reflector();

  it('declares exactly 200 (Nest would answer 201 for a POST, which Asaas counts as a failure)', () => {
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(HttpStatus.OK);
  });

  it('is guarded by the internal key and declares itself reachable by any tenant, suspended ones included', () => {
    expect(Reflect.getMetadata('__guards__', InternalBillingWebhookController)).toContain(
      InternalApiGuard,
    );
    expect(reflector.get(NO_FEATURE_GATE_KEY, InternalBillingWebhookController)).toBe(true);
    expect(reflector.get(SUSPENSION_ACCESS_KEY, InternalBillingWebhookController)).toBe(
      'ANY_AUTHENTICATED',
    );
  });

  it('serves the asaas slug as the ASAAS provider, and no other', () => {
    expect(WEBHOOK_PROVIDER_BY_SLUG['asaas']).toBe('ASAAS');
    expect(WebhookProviderSlugSchema.safeParse('asaas').success).toBe(true);
    expect(WebhookProviderSlugSchema.safeParse('stripe').success).toBe(false);
    expect(WebhookProviderSlugSchema.safeParse('constructor').success).toBe(false);
  });

  it('answers with no body for an event of an unknown tenant (the provider sees an empty 200)', async () => {
    const controller = buildController(new FakeBillingProvider(new AdvanceableClock(NOW)));

    const result = await controller.receive(
      'asaas',
      {
        id: 'evt_1&1',
        event: 'PAYMENT_RECEIVED',
        dateCreated: '2026-03-10 12:00:00',
        payment: { id: 'pay_1', customer: 'cus_1', value: 49 },
      },
      {},
      'corr-1',
    );

    expect(result).toBeUndefined();
  });

  it.each([[[]], [[1, 2, 3]], [undefined], [null]])(
    'acknowledges a body that is not a JSON object (%j) with an empty 200: the adapter cannot read it and a retry could never succeed',
    async (body) => {
      const controller = buildController(new FakeBillingProvider(new AdvanceableClock(NOW)));

      await expect(controller.receive('asaas', body, {}, 'corr-3')).resolves.toBeUndefined();
    },
  );

  it('acknowledges a malformed body with an empty 200 instead of asking the provider to retry it', async () => {
    const controller = buildController(new FakeBillingProvider(new AdvanceableClock(NOW)));

    await expect(
      controller.receive(
        'asaas',
        {
          id: 'evt_2&1',
          event: 'PAYMENT_RECEIVED',
          dateCreated: 'not-a-date',
          payment: { id: 'p' },
        },
        {},
        'corr-2',
      ),
    ).resolves.toBeUndefined();
  });
});
