import { AppLogger } from '../../../../shared/observability/app-logger';
import { LogLeadFormSubmissionReceivedUseCase } from './log-lead-form-submission-received.use-case';

describe('LogLeadFormSubmissionReceivedUseCase', () => {
  it('logs the submission fields at info level and never throws', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const useCase = new LogLeadFormSubmissionReceivedUseCase();

    await expect(
      useCase.execute({
        submissionId: 'bbbbbbbb-0000-4000-8000-000000000002',
        tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
        customerId: null,
        correlationId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      'LeadFormSubmissionReceived received',
      expect.objectContaining({
        submissionId: 'bbbbbbbb-0000-4000-8000-000000000002',
        tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
        customerId: null,
        correlationId: '00000000-0000-4000-8000-000000000001',
      }),
    );
  });

  it('logs a non-null customerId when the submitter is a logged-in customer', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const useCase = new LogLeadFormSubmissionReceivedUseCase();

    await useCase.execute({
      submissionId: 'bbbbbbbb-0000-4000-8000-000000000003',
      tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
      customerId: 'cccccccc-0000-4000-8000-000000000004',
      correlationId: '00000000-0000-4000-8000-000000000005',
    });

    expect(logSpy).toHaveBeenCalledWith(
      'LeadFormSubmissionReceived received',
      expect.objectContaining({ customerId: 'cccccccc-0000-4000-8000-000000000004' }),
    );
  });
});
