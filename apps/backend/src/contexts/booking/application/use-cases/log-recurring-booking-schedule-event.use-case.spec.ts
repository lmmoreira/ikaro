import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { LogRecurringBookingScheduleEventUseCase } from './log-recurring-booking-schedule-event.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000010';
const RECURRING_SCHEDULE_ID = 'bbbbbbbb-0000-4000-8000-000000000010';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000010';

function makeUseCase(): {
  useCase: LogRecurringBookingScheduleEventUseCase;
  inboxRepo: InMemoryInboxRepository;
} {
  const inboxRepo = new InMemoryInboxRepository();
  const useCase = new LogRecurringBookingScheduleEventUseCase(inboxRepo);
  return { useCase, inboxRepo };
}

function baseInput(overrides: Partial<{ eventId: string; eventName: string }> = {}) {
  return {
    eventId: EVENT_ID,
    eventName: 'RecurringBookingScheduleCreated',
    tenantId: TENANT_ID,
    recurringScheduleId: RECURRING_SCHEDULE_ID,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LogRecurringBookingScheduleEventUseCase', () => {
  it('logs the event name and claims the event', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      'RecurringBookingScheduleCreated received',
      expect.objectContaining({
        tenantId: TENANT_ID,
        recurringScheduleId: RECURRING_SCHEDULE_ID,
        correlationId: CORRELATION_ID,
      }),
    );
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('logs each of the 3 event names distinctly', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    logSpy.mockClear();
    const { useCase } = makeUseCase();

    await useCase.execute(
      baseInput({ eventId: 'e1', eventName: 'RecurringBookingScheduleApprovalRequested' }),
    );
    await useCase.execute(baseInput({ eventId: 'e2', eventName: 'RecurringBookingScheduleEnded' }));

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      'RecurringBookingScheduleApprovalRequested received',
      expect.anything(),
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      'RecurringBookingScheduleEnded received',
      expect.anything(),
    );
  });

  it('is idempotent: a redelivered eventId is not logged a second time', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    logSpy.mockClear();
    const { useCase } = makeUseCase();
    const input = baseInput();

    await useCase.execute(input);
    await useCase.execute(input);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('unclaims and rethrows when the log call itself fails, so a future redelivery can retry', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('logger backend unavailable');
    });
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).rejects.toThrow('logger backend unavailable');

    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogRecurringBookingScheduleEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(false);
    logSpy.mockRestore();
  });
});
