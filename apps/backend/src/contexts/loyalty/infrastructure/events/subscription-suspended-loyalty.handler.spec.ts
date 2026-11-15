import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing/subscription-suspended-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantExpiryPauseRepository } from '../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { RecordTenantExpiryPauseUseCase } from '../../application/use-cases/record-tenant-expiry-pause/record-tenant-expiry-pause.use-case';
import { SubscriptionSuspendedLoyaltyHandler } from './subscription-suspended-loyalty.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('SubscriptionSuspendedLoyaltyHandler', () => {
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RecordTenantExpiryPauseUseCase;
  let handler: SubscriptionSuspendedLoyaltyHandler;

  beforeEach(() => {
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    eventBus = new InMemoryEventBus();
    useCase = new RecordTenantExpiryPauseUseCase(pauseRepo);
    handler = new SubscriptionSuspendedLoyaltyHandler(useCase, eventBus);
  });

  it('subscribes with its own consumer name and skipWhenSuspended: false', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      'SubscriptionSuspended',
      expect.any(Function),
      'pause-loyalty-expiry-on-suspension',
      { skipWhenSuspended: false },
    );
  });

  it('opens the tenant pause keyed by the event suspendedAt and passes the correlation id', async () => {
    const suspendedAt = new Date('2026-11-01T10:00:00.000Z');
    const executeSpy = jest.spyOn(useCase, 'execute');
    const event = new SubscriptionSuspendedEventBuilder()
      .withTenantId(TENANT_ID)
      .withSuspendedAt(suspendedAt)
      .withCorrelationId('corr-9')
      .build();

    await handler.handle(event);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      suspendedAt,
      correlationId: 'corr-9',
    });
    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: suspendedAt, resumedAt: null },
    ]);
  });

  it('rethrows so the event is retried', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValue(new Error('db down'));

    await expect(handler.handle(new SubscriptionSuspendedEventBuilder().build())).rejects.toThrow(
      'db down',
    );
  });
});
