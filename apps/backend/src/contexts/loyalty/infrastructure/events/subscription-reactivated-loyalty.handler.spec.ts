import { SubscriptionReactivatedEventBuilder } from '../../../../test/builders/billing/subscription-reactivated-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantExpiryPauseRepository } from '../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { CloseTenantExpiryPauseUseCase } from '../../application/use-cases/close-tenant-expiry-pause/close-tenant-expiry-pause.use-case';
import { SubscriptionReactivatedLoyaltyHandler } from './subscription-reactivated-loyalty.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('SubscriptionReactivatedLoyaltyHandler', () => {
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CloseTenantExpiryPauseUseCase;
  let handler: SubscriptionReactivatedLoyaltyHandler;

  beforeEach(() => {
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    eventBus = new InMemoryEventBus();
    useCase = new CloseTenantExpiryPauseUseCase(pauseRepo);
    handler = new SubscriptionReactivatedLoyaltyHandler(useCase, eventBus);
  });

  it('subscribes with its own consumer name and skipWhenSuspended: false', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      'SubscriptionReactivated',
      expect.any(Function),
      'resume-loyalty-expiry-after-suspension',
      { skipWhenSuspended: false },
    );
  });

  it('closes the pause keyed by the event suspendedAt and passes the correlation id', async () => {
    const suspendedAt = new Date('2026-11-01T10:00:00.000Z');
    const reactivatedAt = new Date('2026-11-05T10:00:00.000Z');
    const executeSpy = jest.spyOn(useCase, 'execute');
    const event = new SubscriptionReactivatedEventBuilder()
      .withTenantId(TENANT_ID)
      .withSuspendedAt(suspendedAt)
      .withReactivatedAt(reactivatedAt)
      .withCorrelationId('corr-9')
      .build();

    await handler.handle(event);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      suspendedAt,
      reactivatedAt,
      correlationId: 'corr-9',
    });
    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: suspendedAt, resumedAt: reactivatedAt },
    ]);
  });

  it('rethrows so the event is retried', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValue(new Error('db down'));

    await expect(handler.handle(new SubscriptionReactivatedEventBuilder().build())).rejects.toThrow(
      'db down',
    );
  });
});
