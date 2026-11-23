import { BillingReminderDueCommandBuilder } from '../../../../test/builders/billing';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  BILLING_FIXTURE_TENANT_ID,
  BillingNotificationFixture,
} from '../../../../test/utils/billing-notification-fixture';
import { SendBillingReminderNotificationUseCase } from '../../application/use-cases/send-billing-reminder-notification/send-billing-reminder-notification.use-case';
import { BillingReminderNotificationHandler } from './billing-reminder-notification.handler';

describe('BillingReminderNotificationHandler', () => {
  let fixture: BillingNotificationFixture;
  let useCase: SendBillingReminderNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: BillingReminderNotificationHandler;

  const event = (): BillingReminderDueCommandBuilder =>
    new BillingReminderDueCommandBuilder().withTenantId(BILLING_FIXTURE_TENANT_ID);

  beforeEach(() => {
    fixture = new BillingNotificationFixture();
    useCase = fixture.build(SendBillingReminderNotificationUseCase);
    eventBus = new InMemoryEventBus();
    handler = new BillingReminderNotificationHandler(useCase, eventBus);
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
        kind: received.data.kind,
        dueDate: received.data.dueDate,
        trialEndsOn: received.data.trialEndsOn,
        suspendsOn: received.data.suspendsOn,
        amountMinor: received.data.amountMinor,
        currency: received.data.currency,
        recipientEmail: received.data.recipientEmail,
      }),
    );
  });

  it('rethrows a failure so Pub/Sub nacks and retries', async () => {
    jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(handler.handle(event().build())).rejects.toThrow('boom');
  });

  it('subscribes to BillingReminderDue under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'BillingReminderDue',
        consumerName: 'send-billing-reminder-notification',
        options: { skipWhenSuspended: false },
      }),
    ]);
  });
});
