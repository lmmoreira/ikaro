import { SubscriptionReactivatedEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendSubscriptionReactivatedNotificationUseCase } from '../../application/use-cases/send-subscription-reactivated-notification/send-subscription-reactivated-notification.use-case';
import { SubscriptionReactivatedNotificationHandler } from './subscription-reactivated-notification.handler';

describe('SubscriptionReactivatedNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionReactivatedNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionReactivatedNotificationHandler;

  const event = (): SubscriptionReactivatedEventBuilder =>
    new SubscriptionReactivatedEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionReactivatedNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionReactivatedNotificationHandler(useCase, eventBus);
  });

  it('hands the event to its use case once, with the eventId and the correlationId of the event', async () => {
    const executeSpy = jest.spyOn(useCase, 'execute');
    const received = event().withCorrelationId('corr-from-event').build();

    await handler.handle(received);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: BILLING_FIXTURE_TENANT_ID,
        eventId: received.eventId,
        correlationId: 'corr-from-event',
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to SubscriptionReactivated under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionReactivated',
        consumerName: 'send-subscription-reactivated-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });

  it('sends no email and writes no log row for an exempt subscription, through the real handler', async () => {
    await handler.handle(event().withRecipientEmail(null).withExempt(true).build());

    expect(fixture.dispatcher.dispatched).toEqual([]);
    expect(fixture.logRepo.all).toEqual([]);
  });
});
