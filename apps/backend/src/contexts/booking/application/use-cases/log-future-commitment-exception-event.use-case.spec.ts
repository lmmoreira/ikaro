import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { LogFutureCommitmentExceptionEventUseCase } from './log-future-commitment-exception-event.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000020';
const EXCEPTION_ID = 'bbbbbbbb-0000-4000-8000-000000000020';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000020';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000020';

function makeUseCase(): {
  useCase: LogFutureCommitmentExceptionEventUseCase;
  inboxRepo: InMemoryInboxRepository;
} {
  const inboxRepo = new InMemoryInboxRepository();
  return { useCase: new LogFutureCommitmentExceptionEventUseCase(inboxRepo), inboxRepo };
}

function baseInput(overrides: Partial<{ eventId: string; eventName: string }> = {}) {
  return {
    eventId: EVENT_ID,
    eventName: 'FutureCommitmentExceptionRaised',
    tenantId: TENANT_ID,
    exceptionId: EXCEPTION_ID,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('LogFutureCommitmentExceptionEventUseCase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the event name and claims the event', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase, inboxRepo } = makeUseCase();

    await expect(useCase.execute(baseInput())).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      'FutureCommitmentExceptionRaised received',
      expect.objectContaining({
        tenantId: TENANT_ID,
        exceptionId: EXCEPTION_ID,
        correlationId: CORRELATION_ID,
      }),
    );
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('logs each of the 3 event names distinctly', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();

    await useCase.execute(
      baseInput({ eventId: 'e1', eventName: 'FutureCommitmentExceptionResolved' }),
    );
    await useCase.execute(
      baseInput({ eventId: 'e2', eventName: 'FutureCommitmentExceptionDismissed' }),
    );

    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      'FutureCommitmentExceptionResolved received',
      expect.anything(),
    );
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      'FutureCommitmentExceptionDismissed received',
      expect.anything(),
    );
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
      inboxRepo.hasBeenProcessed(EVENT_ID, LogFutureCommitmentExceptionEventUseCase.CONSUMER_NAME),
    ).resolves.toBe(false);
  });
});
