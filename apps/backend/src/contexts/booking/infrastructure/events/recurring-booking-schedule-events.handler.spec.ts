import {
  RecurringBookingScheduleApprovalRequestedEventBuilder,
  RecurringBookingScheduleCreatedEventBuilder,
  RecurringBookingScheduleEndedEventBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LogRecurringBookingScheduleEventUseCase } from '../../application/use-cases/log-recurring-booking-schedule-event.use-case';
import { RecurringBookingScheduleEventsHandler } from './recurring-booking-schedule-events.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = 'corr-events-handler-test';

describe('RecurringBookingScheduleEventsHandler', () => {
  let handler: RecurringBookingScheduleEventsHandler;
  let useCase: jest.Mocked<Pick<LogRecurringBookingScheduleEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new RecurringBookingScheduleEventsHandler(
      useCase as unknown as LogRecurringBookingScheduleEventUseCase,
      eventBus,
    );
  });

  it('subscribes to all 4 event types with the audit-log consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');
    handler.onModuleInit();

    expect(spy).toHaveBeenCalledWith(
      'RecurringBookingScheduleCreated',
      expect.any(Function),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    expect(spy).toHaveBeenCalledWith(
      'RecurringBookingScheduleApprovalRequested',
      expect.any(Function),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    expect(spy).toHaveBeenCalledWith(
      'RecurringBookingScheduleEnded',
      expect.any(Function),
      LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME,
    );
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('calls the log use case exactly once with the correct DTO for RecurringBookingScheduleCreated', async () => {
    const event = new RecurringBookingScheduleCreatedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventName: 'RecurringBookingScheduleCreated',
      tenantId: TENANT_ID,
      recurringScheduleId: event.data.recurringScheduleId,
      correlationId: CORRELATION_ID,
    });
  });

  it('handles RecurringBookingScheduleApprovalRequested', async () => {
    const event = new RecurringBookingScheduleApprovalRequestedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'RecurringBookingScheduleApprovalRequested' }),
    );
  });

  it('handles RecurringBookingScheduleEnded', async () => {
    const event = new RecurringBookingScheduleEndedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'RecurringBookingScheduleEnded' }),
    );
  });

  it('rethrows when the use case fails', async () => {
    const event = new RecurringBookingScheduleCreatedEventBuilder().build();
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(event)).rejects.toThrow(error);
  });
});
