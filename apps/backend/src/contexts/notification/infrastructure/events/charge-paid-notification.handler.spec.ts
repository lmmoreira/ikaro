import { ChargePaidEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendChargePaidNotificationUseCase } from '../../application/use-cases/send-charge-paid-notification/send-charge-paid-notification.use-case';
import { ChargePaidNotificationHandler } from './charge-paid-notification.handler';

describe('ChargePaidNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendChargePaidNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: ChargePaidNotificationHandler;

  const event = (): ChargePaidEventBuilder =>
    new ChargePaidEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendChargePaidNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new ChargePaidNotificationHandler(useCase, eventBus);
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
        amountMinor: received.data.amountMinor,
        currency: received.data.currency,
        paidAt: received.data.paidAt,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to ChargePaid under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'ChargePaid',
        consumerName: 'send-charge-paid-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
