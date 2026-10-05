import { BookingRejectedEventBuilder } from '../../../../test/builders/booking/booking-rejected-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { MatchAvailabilityAlertsForBookingUseCase } from '../../application/use-cases/match-availability-alerts-for-booking.use-case';
import { BookingRejectedAvailabilityAlertHandler } from './booking-rejected-availability-alert.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('BookingRejectedAvailabilityAlertHandler', () => {
  let handler: BookingRejectedAvailabilityAlertHandler;
  let useCase: jest.Mocked<Pick<MatchAvailabilityAlertsForBookingUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ notified: 0 }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingRejectedAvailabilityAlertHandler(
      useCase as unknown as MatchAvailabilityAlertsForBookingUseCase,
      eventBus,
    );
  });

  it('subscribes to BookingRejected with its own consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'BookingRejected',
      expect.any(Function),
      BookingRejectedAvailabilityAlertHandler.CONSUMER_NAME,
    );
  });

  it('calls the booking-resolving use case once with the booking id', async () => {
    const event = new BookingRejectedEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      bookingId: event.data.bookingId,
      correlationId: event.correlationId,
    });
  });

  it('rethrows when the use case fails so the message is retried', async () => {
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(new BookingRejectedEventBuilder().build())).rejects.toThrow(error);
  });
});
