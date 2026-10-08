import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingScheduleApprovalRequestedEventBuilder } from '../../../../test/builders/booking/index';
import { SendRecurringScheduleApprovalRequestedNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-approval-requested-notification/send-recurring-schedule-approval-requested-notification.use-case';
import { RecurringScheduleApprovalRequestedNotificationHandler } from './recurring-schedule-approval-requested.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('RecurringScheduleApprovalRequestedNotificationHandler', () => {
  let useCase: jest.Mocked<
    Pick<SendRecurringScheduleApprovalRequestedNotificationUseCase, 'execute'>
  >;
  let eventBus: InMemoryEventBus;
  let handler: RecurringScheduleApprovalRequestedNotificationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ adminEmailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringScheduleApprovalRequestedNotificationHandler(
      useCase as unknown as SendRecurringScheduleApprovalRequestedNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes with the notification consumer name', () => {
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'RecurringBookingScheduleApprovalRequested',
        consumerName: 'notification',
      }),
    ]);
  });

  it('calls exactly one use case with the event ids and correlationId', async () => {
    const event = new RecurringBookingScheduleApprovalRequestedEventBuilder()
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
        approvalHoldExpiresAt: event.data.approvalHoldExpiresAt,
      }),
    );
  });

  it('rethrows errors from the use case', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new RecurringBookingScheduleApprovalRequestedEventBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
