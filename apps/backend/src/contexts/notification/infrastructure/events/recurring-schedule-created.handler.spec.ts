import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingScheduleCreatedEventBuilder } from '../../../../test/builders/booking/index';
import { SendRecurringScheduleCreatedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-created-notification/send-recurring-schedule-created-notification.use-case';
import { RecurringScheduleCreatedNotificationHandler } from './recurring-schedule-created.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('RecurringScheduleCreatedNotificationHandler', () => {
  let useCase: jest.Mocked<Pick<SendRecurringScheduleCreatedNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: RecurringScheduleCreatedNotificationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringScheduleCreatedNotificationHandler(
      useCase as unknown as SendRecurringScheduleCreatedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes with the notification consumer name', () => {
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'RecurringBookingScheduleCreated',
        consumerName: 'notification',
      }),
    ]);
  });

  it('calls exactly one use case with the event ids and correlationId', async () => {
    const event = new RecurringBookingScheduleCreatedEventBuilder()
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
        daysOfWeek: ['tuesday'],
        startTime: '10:00',
        startsOn: '2026-09-01',
        endsOn: '2026-11-24',
      }),
    );
  });

  it('rethrows errors from the use case', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new RecurringBookingScheduleCreatedEventBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
