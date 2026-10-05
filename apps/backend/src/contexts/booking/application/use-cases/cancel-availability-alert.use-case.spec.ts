import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import {
  AvailabilityAlertNotEditableError,
  AvailabilityAlertNotFoundError,
} from '../../domain/errors/availability-alert.error';
import { CancelAvailabilityAlertUseCase } from './cancel-availability-alert.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER = '00000000-0000-7000-8000-0000000000c1';
const OTHER_CUSTOMER = '00000000-0000-7000-8000-0000000000c2';

describe('CancelAvailabilityAlertUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CancelAvailabilityAlertUseCase;

  const run = (alertId: string, overrides: { customerId?: string; tenantId?: string } = {}) =>
    useCase.execute({
      alertId,
      tenantId: overrides.tenantId ?? TENANT,
      customerId: overrides.customerId ?? CUSTOMER,
      correlationId: 'corr-1',
    });

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    alertRepo = new InMemoryAvailabilityAlertRepository(eventBus);
    useCase = new CancelAvailabilityAlertUseCase(alertRepo, new InMemoryTransactionManager());
  });

  it('cancels an ACTIVE alert, saves it and publishes AvailabilityAlertCancelled', async () => {
    const alert = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).build();
    alertRepo.seed(alert);

    const result = await run(alert.id);

    expect(result).toEqual({ id: alert.id, status: 'CANCELLED' });
    expect((await alertRepo.findById(alert.id, TENANT))?.status).toBe('CANCELLED');
    expect(eventBus.published.map((e) => e.eventName)).toEqual(['AvailabilityAlertCancelled']);
  });

  it('is an idempotent success on an already-cancelled alert, publishing nothing', async () => {
    const alert = new AvailabilityAlertBuilder()
      .withCustomerId(CUSTOMER)
      .withStatus('CANCELLED')
      .build();
    alertRepo.seed(alert);

    await expect(run(alert.id)).resolves.toEqual({ id: alert.id, status: 'CANCELLED' });
    expect(eventBus.published).toHaveLength(0);
  });

  it.each(['NOTIFIED', 'EXPIRED'] as const)('refuses to cancel a %s alert', async (status) => {
    const alert = new AvailabilityAlertBuilder()
      .withCustomerId(CUSTOMER)
      .withStatus(status)
      .build();
    alertRepo.seed(alert);

    await expect(run(alert.id)).rejects.toThrow(AvailabilityAlertNotEditableError);
  });

  it('refuses to cancel an ACTIVE alert already past its expiry, publishing nothing', async () => {
    const alert = new AvailabilityAlertBuilder()
      .withCustomerId(CUSTOMER)
      .withExpiresAt(new Date(Date.now() - 3_600_000))
      .build();
    alertRepo.seed(alert);

    await expect(run(alert.id)).rejects.toThrow(AvailabilityAlertNotEditableError);
    expect((await alertRepo.findById(alert.id, TENANT))?.status).toBe('ACTIVE');
    expect(eventBus.published).toHaveLength(0);
  });

  it("reads another customer's alert in the same tenant as not found, and leaves it untouched", async () => {
    const alert = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).build();
    alertRepo.seed(alert);

    await expect(run(alert.id, { customerId: OTHER_CUSTOMER })).rejects.toThrow(
      AvailabilityAlertNotFoundError,
    );
    expect((await alertRepo.findById(alert.id, TENANT))?.status).toBe('ACTIVE');
  });

  it("reads another tenant's alert, and an unknown id, as not found", async () => {
    const alert = new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).build();
    alertRepo.seed(alert);

    await expect(run(alert.id, { tenantId: OTHER_TENANT })).rejects.toThrow(
      AvailabilityAlertNotFoundError,
    );
    await expect(run('00000000-0000-7000-8000-0000000000ff')).rejects.toThrow(
      AvailabilityAlertNotFoundError,
    );
  });
});
