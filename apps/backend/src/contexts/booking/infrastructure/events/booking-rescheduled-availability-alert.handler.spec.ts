import { BookingRescheduledEventBuilder } from '../../../../test/builders/booking/booking-rescheduled-event.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { MatchAvailabilityAlertsUseCase } from '../../application/use-cases/match-availability-alerts.use-case';
import { BookingRescheduledAvailabilityAlertHandler } from './booking-rescheduled-availability-alert.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = 'corr-rescheduled-alert-test';

describe('BookingRescheduledAvailabilityAlertHandler', () => {
  let handler: BookingRescheduledAvailabilityAlertHandler;
  let useCase: jest.Mocked<Pick<MatchAvailabilityAlertsUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = { execute: jest.fn().mockResolvedValue({ notified: 0 }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingRescheduledAvailabilityAlertHandler(
      useCase as unknown as MatchAvailabilityAlertsUseCase,
      eventBus,
    );
  });

  it('subscribes to BookingRescheduled with its own consumer name on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');

    handler.onModuleInit();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'BookingRescheduled',
      expect.any(Function),
      BookingRescheduledAvailabilityAlertHandler.CONSUMER_NAME,
    );
  });

  it("calls the matching use case once with the booking's services and its PREVIOUS start", async () => {
    const event = new BookingRescheduledEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      correlationId: CORRELATION_ID,
      serviceIds: event.data.lineSummary.map((line) => line.serviceId),
      around: new Date(event.data.previousSlot.startTime),
    });
  });

  it('rethrows when the use case fails so the message is retried', async () => {
    const error = new Error('boom');
    useCase.execute.mockRejectedValueOnce(error);

    await expect(handler.handle(new BookingRescheduledEventBuilder().build())).rejects.toThrow(
      error,
    );
  });
});
