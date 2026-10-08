import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingScheduleEndedEventBuilder } from '../../../../test/builders/booking/index';
import { SendRecurringScheduleEndedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-ended-notification/send-recurring-schedule-ended-notification.use-case';
import { RecurringScheduleEndedNotificationHandler } from './recurring-schedule-ended.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('RecurringScheduleEndedNotificationHandler', () => {
  let useCase: jest.Mocked<Pick<SendRecurringScheduleEndedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: RecurringScheduleEndedNotificationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringScheduleEndedNotificationHandler(
      useCase as unknown as SendRecurringScheduleEndedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes with the notification consumer name', () => {
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'RecurringBookingScheduleEnded',
        consumerName: 'notification',
      }),
    ]);
  });

  it('calls exactly one use case with the event ids and correlationId', async () => {
    const event = new RecurringBookingScheduleEndedEventBuilder()
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
        endedBy: 'CUSTOMER',
      }),
    );
  });

  it('rethrows errors from the use case', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new RecurringBookingScheduleEndedEventBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
