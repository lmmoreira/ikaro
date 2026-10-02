import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { LogBookingNoShowEventUseCase } from './log-booking-no-show-event.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000020';
const BOOKING_ID = 'bbbbbbbb-0000-4000-8000-000000000020';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000020';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000020';

const input = {
  eventId: EVENT_ID,
  eventName: 'BookingNoShow',
  tenantId: TENANT_ID,
  bookingId: BOOKING_ID,
  correlationId: CORRELATION_ID,
};

describe('LogBookingNoShowEventUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs the event and claims it under the audit-log consumer name', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new LogBookingNoShowEventUseCase(inboxRepo);

    await expect(useCase.execute(input)).resolves.toBeUndefined();

    expect(LogBookingNoShowEventUseCase.CONSUMER_NAME).toBe('audit-log');
    expect(logSpy).toHaveBeenCalledWith(
      'BookingNoShow received',
      expect.objectContaining({
        tenantId: TENANT_ID,
        bookingId: BOOKING_ID,
        correlationId: CORRELATION_ID,
      }),
    );
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogBookingNoShowEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('is idempotent: a redelivered eventId is not logged a second time', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const useCase = new LogBookingNoShowEventUseCase(new InMemoryInboxRepository());

    await useCase.execute(input);
    await useCase.execute(input);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('unclaims and rethrows when the log call itself fails, so a redelivery can retry', async () => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('logger backend unavailable');
    });
    const inboxRepo = new InMemoryInboxRepository();
    const useCase = new LogBookingNoShowEventUseCase(inboxRepo);

    await expect(useCase.execute(input)).rejects.toThrow('logger backend unavailable');

    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogBookingNoShowEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(false);
  });
});
