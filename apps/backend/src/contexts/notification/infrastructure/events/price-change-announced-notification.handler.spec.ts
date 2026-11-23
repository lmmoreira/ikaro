import { SubscriptionPriceChangeAnnouncedEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendPriceChangeAnnouncedNotificationUseCase } from '../../application/use-cases/send-price-change-announced-notification/send-price-change-announced-notification.use-case';
import { PriceChangeAnnouncedNotificationHandler } from './price-change-announced-notification.handler';

describe('PriceChangeAnnouncedNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendPriceChangeAnnouncedNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: PriceChangeAnnouncedNotificationHandler;

  const event = (): SubscriptionPriceChangeAnnouncedEventBuilder =>
    new SubscriptionPriceChangeAnnouncedEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendPriceChangeAnnouncedNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new PriceChangeAnnouncedNotificationHandler(useCase, eventBus);
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

  it('subscribes to SubscriptionPriceChangeAnnounced under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'SubscriptionPriceChangeAnnounced',
        consumerName: 'send-price-change-announced-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
