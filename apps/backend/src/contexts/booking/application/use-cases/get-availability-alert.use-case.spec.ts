import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { AvailabilityAlertNotFoundError } from '../../domain/errors/availability-alert.error';
import { GetAvailabilityAlertUseCase } from './get-availability-alert.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000009';
const CUSTOMER = '00000000-0000-7000-8000-000000000002';
const OTHER_CUSTOMER = '00000000-0000-7000-8000-000000000003';

describe('GetAvailabilityAlertUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let useCase: GetAvailabilityAlertUseCase;

  beforeEach(() => {
    alertRepo = new InMemoryAvailabilityAlertRepository(new InMemoryEventBus());
    useCase = new GetAvailabilityAlertUseCase(alertRepo);
  });

  it.each(['ACTIVE', 'NOTIFIED', 'EXPIRED', 'CANCELLED'] as const)(
    "returns the owner's %s alert",
    async (status) => {
      const alert = new AvailabilityAlertBuilder()
        .withTenantId(TENANT)
        .withCustomerId(CUSTOMER)
        .withStatus(status)
        .build();
      alertRepo.seed(alert);

      const result = await useCase.execute({
        alertId: alert.id,
        tenantId: TENANT,
        customerId: CUSTOMER,
      });

      expect(result).toMatchObject({ id: alert.id, status });
    },
  );

  it("throws not-found for another customer's alert in the same tenant", async () => {
    const foreign = new AvailabilityAlertBuilder()
      .withTenantId(TENANT)
      .withCustomerId(OTHER_CUSTOMER)
      .build();
    alertRepo.seed(foreign);

    await expect(
      useCase.execute({ alertId: foreign.id, tenantId: TENANT, customerId: CUSTOMER }),
    ).rejects.toBeInstanceOf(AvailabilityAlertNotFoundError);
  });

  it("throws not-found for another tenant's alert", async () => {
    const otherTenant = new AvailabilityAlertBuilder()
      .withTenantId(OTHER_TENANT)
      .withCustomerId(CUSTOMER)
      .build();
    alertRepo.seed(otherTenant);

    await expect(
      useCase.execute({ alertId: otherTenant.id, tenantId: TENANT, customerId: CUSTOMER }),
    ).rejects.toBeInstanceOf(AvailabilityAlertNotFoundError);
  });

  it('throws not-found for an unknown id', async () => {
    await expect(
      useCase.execute({ alertId: 'does-not-exist', tenantId: TENANT, customerId: CUSTOMER }),
    ).rejects.toBeInstanceOf(AvailabilityAlertNotFoundError);
  });
});
