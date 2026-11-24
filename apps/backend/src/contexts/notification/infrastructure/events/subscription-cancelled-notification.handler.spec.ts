import { SubscriptionCancelledEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendSubscriptionCancelledNotificationUseCase } from '../../application/use-cases/send-subscription-cancelled-notification/send-subscription-cancelled-notification.use-case';
import { SubscriptionCancelledNotificationHandler } from './subscription-cancelled-notification.handler';

describe('SubscriptionCancelledNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionCancelledNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionCancelledNotificationHandler;

  const event = (): SubscriptionCancelledEventBuilder =>
    new SubscriptionCancelledEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionCancelledNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionCancelledNotificationHandler(useCase, eventBus);
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
        immediate: received.data.immediate,
        cancelAt: received.data.cancelAt,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to SubscriptionCancelled under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionCancelled',
        consumerName: 'send-subscription-cancelled-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
