import { ChargeIssuedEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendChargeIssuedNotificationUseCase } from '../../application/use-cases/send-charge-issued-notification/send-charge-issued-notification.use-case';
import { ChargeIssuedNotificationHandler } from './charge-issued-notification.handler';

describe('ChargeIssuedNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendChargeIssuedNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: ChargeIssuedNotificationHandler;

  const event = (): ChargeIssuedEventBuilder =>
    new ChargeIssuedEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendChargeIssuedNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new ChargeIssuedNotificationHandler(useCase, eventBus);
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

  it('subscribes to ChargeIssued under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'ChargeIssued',
        consumerName: 'send-charge-issued-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });

  it('sends the invoice email through the real use case', async () => {
    await handler.handle(event().build());

    expect(fixture.dispatcher.dispatched).toHaveLength(1);
  });
});
