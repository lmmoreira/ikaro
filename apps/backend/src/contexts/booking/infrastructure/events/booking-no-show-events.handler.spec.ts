import { BookingNoShowEventBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { LogBookingNoShowEventUseCase } from '../../application/use-cases/log-booking-no-show-event.use-case';
import { BookingNoShowEventsHandler } from './booking-no-show-events.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = 'corr-no-show-handler-test';

describe('BookingNoShowEventsHandler', () => {
  let handler: BookingNoShowEventsHandler;
  let useCase: jest.Mocked<Pick<LogBookingNoShowEventUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue(undefined) };
    eventBus = new InMemoryEventBus();
    handler = new BookingNoShowEventsHandler(
      useCase as unknown as LogBookingNoShowEventUseCase,
      eventBus,
    );
  });

  it('subscribes to BookingNoShow with the audit-log consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'BookingNoShow',
      expect.any(Function),
      LogBookingNoShowEventUseCase.CONSUMER_NAME,
    );
  });

  it('calls the log use case exactly once with the correct DTO', async () => {
    const event = new BookingNoShowEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      eventId: event.eventId,
      eventName: 'BookingNoShow',
      tenantId: TENANT_ID,
      bookingId: event.data.bookingId,
      correlationId: CORRELATION_ID,
    });
  });

  it('rethrows when the use case fails', async () => {
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(new BookingNoShowEventBuilder().build())).rejects.toThrow(error);
  });
});
