import { SubscriptionPastDueEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendSubscriptionPastDueNotificationUseCase } from '../../application/use-cases/send-subscription-past-due-notification/send-subscription-past-due-notification.use-case';
import { SubscriptionPastDueNotificationHandler } from './subscription-past-due-notification.handler';

describe('SubscriptionPastDueNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendSubscriptionPastDueNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: SubscriptionPastDueNotificationHandler;

  const event = (): SubscriptionPastDueEventBuilder =>
    new SubscriptionPastDueEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendSubscriptionPastDueNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new SubscriptionPastDueNotificationHandler(useCase, eventBus);
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
        suspendsAt: received.data.suspendsAt,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to SubscriptionPastDue under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionPastDue',
        consumerName: 'send-subscription-past-due-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
