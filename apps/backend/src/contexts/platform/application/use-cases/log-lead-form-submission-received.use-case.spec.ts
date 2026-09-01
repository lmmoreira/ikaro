import { AppLogger } from '../../../../shared/observability/app-logger';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { LogLeadFormSubmissionReceivedUseCase } from './log-lead-form-submission-received.use-case';

const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const SUBMISSION_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORRELATION_ID = '00000000-0000-4000-8000-000000000001';

function makeUseCase(): {
  useCase: LogLeadFormSubmissionReceivedUseCase;
  inboxRepo: InMemoryInboxRepository;
} {
  const inboxRepo = new InMemoryInboxRepository();
  const useCase = new LogLeadFormSubmissionReceivedUseCase(
    inboxRepo,
    new InMemoryTransactionManager(),
  );
  return { useCase, inboxRepo };
}

describe('LogLeadFormSubmissionReceivedUseCase', () => {
  it('logs the submission fields at info level and marks the event processed', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase, inboxRepo } = makeUseCase();

    await expect(
      useCase.execute({
        eventId: EVENT_ID,
        submissionId: SUBMISSION_ID,
        tenantId: TENANT_ID,
        customerId: null,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      'LeadFormSubmissionReceived received',
      expect.objectContaining({
        submissionId: SUBMISSION_ID,
        tenantId: TENANT_ID,
        customerId: null,
        correlationId: CORRELATION_ID,
      }),
    );
    await expect(
      inboxRepo.hasBeenProcessed(EVENT_ID, LogLeadFormSubmissionReceivedUseCase.CONSUMER_NAME),
    ).resolves.toBe(true);
  });

  it('logs a non-null customerId when the submitter is a logged-in customer', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const { useCase } = makeUseCase();

    await useCase.execute({
      eventId: EVENT_ID,
      submissionId: 'bbbbbbbb-0000-4000-8000-000000000003',
      tenantId: TENANT_ID,
      customerId: 'cccccccc-0000-4000-8000-000000000004',
      correlationId: CORRELATION_ID,
    });

    expect(logSpy).toHaveBeenCalledWith(
      'LeadFormSubmissionReceived received',
      expect.objectContaining({ customerId: 'cccccccc-0000-4000-8000-000000000004' }),
    );
  });

  it('is idempotent: a redelivered eventId is not logged a second time', async () => {
    // mockClear() (not a fresh spyOn) — AppLogger.prototype.log is spied by every test in this
    // file; jest.spyOn returns the same underlying mock on an already-spied method, so its call
    // history carries over unless explicitly cleared here.
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    logSpy.mockClear();
    const { useCase } = makeUseCase();
    const input = {
      eventId: EVENT_ID,
      submissionId: SUBMISSION_ID,
      tenantId: TENANT_ID,
      customerId: null,
      correlationId: CORRELATION_ID,
    };

    await useCase.execute(input);
    await useCase.execute(input);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
