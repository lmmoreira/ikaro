import { TenantProvisionedEventBuilder } from '../../../../test/builders/platform';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  CreateTrialSubscriptionUseCase,
  type CreateTrialSubscriptionUseCaseInput,
  type CreateTrialSubscriptionUseCaseResult,
} from '../../application/use-cases/create-trial-subscription.use-case';
import { TenantProvisionedBillingHandler } from './tenant-provisioned-billing.handler';

const REGISTRATION_ID = 'cccccccc-0000-4000-8000-000000000003';

// A recording stand-in for the one use case the handler may call: it pins what the handler passes
// without re-testing the use case (its own spec covers the flow).
class RecordingUseCase {
  readonly calls: CreateTrialSubscriptionUseCaseInput[] = [];
  failWith: Error | null = null;

  async execute(
    input: CreateTrialSubscriptionUseCaseInput,
  ): Promise<CreateTrialSubscriptionUseCaseResult> {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;
    return { created: true };
  }
}

function makeHandler(): {
  handler: TenantProvisionedBillingHandler;
  useCase: RecordingUseCase;
  eventBus: InMemoryEventBus;
} {
  const useCase = new RecordingUseCase();
  const eventBus = new InMemoryEventBus();
  const handler = new TenantProvisionedBillingHandler(
    useCase as unknown as CreateTrialSubscriptionUseCase,
    eventBus,
  );
  return { handler, useCase, eventBus };
}

describe('TenantProvisionedBillingHandler', () => {
  it('calls exactly one use case with the event fields, its id and its correlation id', async () => {
    const { handler, useCase } = makeHandler();
    const event = new TenantProvisionedEventBuilder()
      .withTenantId('aaaaaaaa-0000-4000-8000-000000000001')
      .withCorrelationId('corr-billing-handler')
      .withSlug('lavacar')
      .withAdminEmail('admin@lavacar.com.br')
      .withTimezone('America/Sao_Paulo')
      .withCountryCode('BR')
      .withRegistrationId(REGISTRATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.calls).toEqual([
      {
        tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
        slug: 'lavacar',
        countryCode: 'BR',
        timezone: 'America/Sao_Paulo',
        adminEmail: 'admin@lavacar.com.br',
        occurredAt: event.occurredAt,
        registrationId: REGISTRATION_ID,
        eventId: event.eventId,
        correlationId: 'corr-billing-handler',
      },
    ]);
  });

  it('rethrows the use case error so Pub/Sub nacks and retries', async () => {
    const { handler, useCase } = makeHandler();
    useCase.failWith = new Error('no prices');

    await expect(handler.handle(new TenantProvisionedEventBuilder().build())).rejects.toThrow(
      'no prices',
    );
  });

  it('subscribes to TenantProvisioned under the use case consumer name', () => {
    const { handler, eventBus } = makeHandler();

    handler.onModuleInit();

    expect(CreateTrialSubscriptionUseCase.CONSUMER_NAME).toBe('create-trial-subscription');
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'TenantProvisioned',
        consumerName: CreateTrialSubscriptionUseCase.CONSUMER_NAME,
      }),
    ]);
  });
});
