import { SubscriptionSuspendedEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendSubscriptionSuspendedNotificationUseCase } from '../../application/use-cases/send-subscription-suspended-notification/send-subscription-suspended-notification.use-case';
import { SubscriptionSuspendedNotificationHandler } from './subscription-suspended-notification.handler';

describe('SubscriptionSuspendedNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionSuspendedNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionSuspendedNotificationHandler;

  const event = (): SubscriptionSuspendedEventBuilder =>
    new SubscriptionSuspendedEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionSuspendedNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionSuspendedNotificationHandler(useCase, eventBus);
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
        reason: received.data.reason,
        purgeAt: received.data.purgeAt,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to SubscriptionSuspended under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionSuspended',
        consumerName: 'send-subscription-suspended-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
