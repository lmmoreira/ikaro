import { RecurringScheduleRenewalDueCommandBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { SendRecurringScheduleRenewalNotificationUseCase } from '../../application/use-cases/send-recurring-schedule-renewal-notification/send-recurring-schedule-renewal-notification.use-case';
import { RecurringScheduleRenewalNotificationHandler } from './recurring-schedule-renewal.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000021';

describe('RecurringScheduleRenewalNotificationHandler', () => {
  let useCase: jest.Mocked<Pick<SendRecurringScheduleRenewalNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: RecurringScheduleRenewalNotificationHandler;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringScheduleRenewalNotificationHandler(
      useCase as unknown as SendRecurringScheduleRenewalNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('subscribes with the notification consumer name', () => {
    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'RecurringScheduleRenewalDue',
        consumerName: 'notification',
      }),
    ]);
  });

  it('calls exactly one use case with the Command ids and correlationId', async () => {
    const command = new RecurringScheduleRenewalDueCommandBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId('corr-handler-1')
      .build();

    await handler.handle(command);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: command.eventId,
      correlationId: 'corr-handler-1',
      recurringScheduleId: command.data.recurringScheduleId,
      customerId: command.data.customerId,
      serviceId: command.data.serviceId,
      daysOfWeek: command.data.daysOfWeek,
      startTime: command.data.startTime,
      startsOn: command.data.startsOn,
      endsOn: command.data.endsOn,
    });
  });

  it('rethrows errors from the use case', async () => {
    useCase.execute.mockRejectedValue(new Error('use case failure'));

    await expect(
      handler.handle(
        new RecurringScheduleRenewalDueCommandBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('use case failure');
  });
});
