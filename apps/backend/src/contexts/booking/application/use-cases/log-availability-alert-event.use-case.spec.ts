import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { LogAvailabilityAlertEventUseCase } from './log-availability-alert-event.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000020';
const ALERT_ID = 'bbbbbbbb-0000-4000-8000-000000000020';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000020';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000020';

function makeUseCase(): {
  useCase: LogAvailabilityAlertEventUseCase;
  inboxRepo: InMemoryInboxRepository;
} {
  const inboxRepo = new InMemoryInboxRepository();
  return { useCase: new LogAvailabilityAlertEventUseCase(inboxRepo), inboxRepo };
}

function baseInput(overrides: Partial<{ eventId: string; eventName: string }> = {}) {
  return {
    eventId: EVENT_ID,
    eventName: 'AvailabilityAlertCreated',
    tenantId: TENANT_ID,
    alertId: ALERT_ID,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LogAvailabilityAlertEventUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs the event name and claims the event', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      'AvailabilityAlertCreated received',
      expect.objectContaining({
        tenantId: TENANT_ID,
        alertId: ALERT_ID,
        correlationId: CORRELATION_ID,
      }),
    );
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogAvailabilityAlertEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('is idempotent: a redelivered eventId is not logged a second time', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();
    const input = baseInput();

    await useCase.execute(input);
    await useCase.execute(input);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('unclaims and rethrows when the log call itself fails, so a redelivery can retry', async () => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('logger backend unavailable');
    });
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).rejects.toThrow('logger backend unavailable');

    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogAvailabilityAlertEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(false);
  });
});
