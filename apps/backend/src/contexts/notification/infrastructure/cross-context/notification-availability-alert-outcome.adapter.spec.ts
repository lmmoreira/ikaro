import { RecordAvailabilityAlertOutcomeUseCase } from '../../../booking/application/use-cases/record-availability-alert-outcome.use-case';
import { NotificationAvailabilityAlertOutcomeAdapter } from './notification-availability-alert-outcome.adapter';

describe('NotificationAvailabilityAlertOutcomeAdapter', () => {
  it('hands the report to the Booking use case unchanged', async () => {
    const execute = jest.fn().mockResolvedValue({ recorded: true });
    const adapter = new NotificationAvailabilityAlertOutcomeAdapter({
      execute,
    } as unknown as RecordAvailabilityAlertOutcomeUseCase);
    const report = {
      tenantId: 'tenant-1',
      alertId: 'alert-1',
      correlationId: 'corr-1',
      matchingWindowStart: '2030-03-04T13:00:00.000Z',
      matchingWindowEnd: '2030-03-04T14:00:00.000Z',
      outcome: 'FAILED' as const,
      errorMessage: 'smtp down',
    };

    await adapter.recordOutcome(report);

    expect(execute).toHaveBeenCalledWith(report);
  });
});
