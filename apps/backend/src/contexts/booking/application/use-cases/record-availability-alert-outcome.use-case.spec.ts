import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/availability-alert.builder';
import { RecordAvailabilityAlertOutcomeUseCase } from './record-availability-alert-outcome.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const ALERT_ID = '00000000-0000-7000-8000-0000000000a1';
const WINDOW_START = new Date('2030-03-04T13:00:00.000Z');
const WINDOW_END = new Date('2030-03-04T14:00:00.000Z');

async function seedMatchedAlert(
  alertRepo: InMemoryAvailabilityAlertRepository,
  tenantId = TENANT,
): Promise<void> {
  const alert = new AvailabilityAlertBuilder().withId(ALERT_ID).withTenantId(tenantId).build();
  alert.recordNotificationAttempt(
    { startsAt: WINDOW_START, endsAt: WINDOW_END },
    'EMAIL',
    'corr-1',
  );
  await alertRepo.save(alert);
}

describe('RecordAvailabilityAlertOutcomeUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let useCase: RecordAvailabilityAlertOutcomeUseCase;

  const input = (overrides: Partial<Parameters<typeof useCase.execute>[0]> = {}) => ({
    tenantId: TENANT,
    alertId: ALERT_ID,
    correlationId: 'corr-2',
    matchingWindowStart: WINDOW_START.toISOString(),
    matchingWindowEnd: WINDOW_END.toISOString(),
    outcome: 'SENT' as 'SENT' | 'FAILED',
    errorMessage: null as string | null,
    ...overrides,
  });

  beforeEach(async () => {
    alertRepo = new InMemoryAvailabilityAlertRepository();
    useCase = new RecordAvailabilityAlertOutcomeUseCase(
      alertRepo,
      new InMemoryTransactionManager(),
    );
    await seedMatchedAlert(alertRepo);
  });

  it('marks the attempt SENT and counts the try', async () => {
    const result = await useCase.execute(input());

    expect(result).toEqual({ recorded: true });
    expect(alertRepo.attempts[0]).toMatchObject({
      outcome: 'SENT',
      attemptCount: 1,
      lastError: null,
    });
  });

  it('marks the attempt FAILED with the reason, counting each failed try', async () => {
    await useCase.execute(input({ outcome: 'FAILED', errorMessage: 'smtp down' }));
    await useCase.execute(input({ outcome: 'FAILED', errorMessage: 'smtp still down' }));

    expect(alertRepo.attempts[0]).toMatchObject({
      outcome: 'FAILED',
      attemptCount: 2,
      lastError: 'smtp still down',
    });
  });

  it('turns FAILED into SENT on a later success and clears the reason', async () => {
    await useCase.execute(input({ outcome: 'FAILED', errorMessage: 'smtp down' }));
    await useCase.execute(input({ outcome: 'SENT', errorMessage: 'ignored' }));

    expect(alertRepo.attempts[0]).toMatchObject({
      outcome: 'SENT',
      attemptCount: 2,
      lastError: null,
    });
  });

  it('records nothing and does not fail when the attempt row is gone', async () => {
    const result = await useCase.execute(
      input({ alertId: '00000000-0000-7000-8000-0000000000ff' }),
    );

    expect(result).toEqual({ recorded: false });
    expect(alertRepo.attempts[0].outcome).toBe('PENDING');
  });

  it('never touches another tenant’s attempt', async () => {
    const result = await useCase.execute(input({ tenantId: OTHER_TENANT }));

    expect(result).toEqual({ recorded: false });
    expect(alertRepo.attempts[0]).toMatchObject({ outcome: 'PENDING', attemptCount: 0 });
  });
});
