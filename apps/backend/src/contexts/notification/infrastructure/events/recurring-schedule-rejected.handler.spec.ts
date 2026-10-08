import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingScheduleRejectedEventBuilder } from '../../../../test/builders/booking/index';
import { SendRecurringScheduleRejectedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-rejected-notification/send-recurring-schedule-rejected-notification.use-case';
import { RecurringScheduleRejectedNotificationHandler } from './recurring-schedule-rejected.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('RecurringScheduleRejectedNotificationHandler', () => {
  let useCase: jest.Mocked<Pick<SendRecurringScheduleRejectedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: RecurringScheduleRejectedNotificationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringScheduleRejectedNotificationHandler(
      useCase as unknown as SendRecurringScheduleRejectedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes with the notification consumer name', () => {
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'RecurringBookingScheduleRejected',
        consumerName: 'notification',
      }),
    ]);
  });

  it('calls exactly one use case with the event ids and correlationId', async () => {
    const event = new RecurringBookingScheduleRejectedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-handler-1')
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        eventId: event.eventId,
        correlationId: 'corr-handler-1',
        customerId: event.data.customerId,
        serviceId: event.data.serviceId,
        reason: event.data.reason,
      }),
    );
  });

  it('rethrows errors from the use case', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new RecurringBookingScheduleRejectedEventBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
