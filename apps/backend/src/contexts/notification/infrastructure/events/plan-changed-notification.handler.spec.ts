import { PlanChangedEventBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendPlanChangedNotificationUseCase } from '../../application/use-cases/send-plan-changed-notification/send-plan-changed-notification.use-case';
import { PlanChangedNotificationHandler } from './plan-changed-notification.handler';

describe('PlanChangedNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendPlanChangedNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: PlanChangedNotificationHandler;

  const event = (): PlanChangedEventBuilder =>
    new PlanChangedEventBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendPlanChangedNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new PlanChangedNotificationHandler(useCase, eventBus);
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
        newTotalMinor: received.data.newTotalMinor,
        currency: received.data.currency,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to PlanChanged under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'PlanChanged',
        consumerName: 'send-plan-changed-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
