import {
  AvailabilityAlertBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { AvailabilityAlertResultAssembler } from '../services/availability-alert-result.assembler';
import { ListAvailabilityAlertsUseCase } from './list-availability-alerts.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER = '00000000-0000-7000-8000-0000000000c1';
const OTHER_CUSTOMER = '00000000-0000-7000-8000-0000000000c2';

describe('ListAvailabilityAlertsUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let useCase: ListAvailabilityAlertsUseCase;
  let serviceId: string;

  beforeEach(async () => {
    alertRepo = new InMemoryAvailabilityAlertRepository();
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    const service = new ServiceBuilder().withTenantId(TENANT).withName('Limpeza de pele').build();
    await serviceRepo.save(service);
    serviceId = service.id;
    useCase = new ListAvailabilityAlertsUseCase(
      alertRepo,
      new AvailabilityAlertResultAssembler(serviceRepo, resourceRepo, alertRepo),
    );
  });

  const aliceAlert = () =>
    new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).withServiceId(serviceId);

  it("lists the caller's own alerts, newest first, history included", async () => {
    const older = aliceAlert()
      .withStatus('EXPIRED')
      .withCreatedAt(new Date('2026-01-01T00:00:00.000Z'))
      .build();
    const newer = aliceAlert().withCreatedAt(new Date('2026-02-01T00:00:00.000Z')).build();
    alertRepo.seed(older);
    alertRepo.seed(newer);

    const result = await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(result.items[1]).toMatchObject({ status: 'EXPIRED', criteriaType: 'ONE_TIME_RANGE' });
  });

  it("never lists another customer's alerts or another tenant's", async () => {
    alertRepo.seed(
      new AvailabilityAlertBuilder()
        .withCustomerId(OTHER_CUSTOMER)
        .withServiceId(serviceId)
        .build(),
    );
    alertRepo.seed(
      new AvailabilityAlertBuilder()
        .withCustomerId(CUSTOMER)
        .withTenantId(OTHER_TENANT)
        .withServiceId(serviceId)
        .build(),
    );

    const result = await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

    expect(result.items).toEqual([]);
  });

  it('maps a weekly alert to the wire shape (null range fields, HH:mm times)', async () => {
    alertRepo.seed(aliceAlert().withWeeklyPreference(['monday'], '09:00', '10:30').build());

    const [item] = (await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER })).items;

    expect(item).toMatchObject({
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['monday'],
      localStartTime: '09:00',
      localEndTime: '10:30',
      acceptableStartAt: null,
      acceptableEndAt: null,
    });
  });

  describe('names and notification time (M23-S43)', () => {
    const sentAttempt = (alertId: string, attemptedAt: Date) => ({
      id: `attempt-${alertId}`,
      tenantId: TENANT,
      alertId,
      matchingWindow: {
        startsAt: new Date('2026-03-01T12:00:00.000Z'),
        endsAt: new Date('2026-03-01T13:00:00.000Z'),
      },
      channel: 'EMAIL' as const,
      attemptedAt,
      outcome: 'SENT' as const,
      attemptCount: 1,
      lastError: null,
    });

    it('carries the service name, the preferred resource name or null, and when it was notified', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT).withName('Carla Menezes').build();
      await resourceRepo.save(resource);
      const withResource = aliceAlert()
        .withPreferredResourceId(resource.id)
        .withStatus('NOTIFIED')
        .withCreatedAt(new Date('2026-02-02T00:00:00.000Z'))
        .build();
      const plain = aliceAlert().withCreatedAt(new Date('2026-02-01T00:00:00.000Z')).build();
      alertRepo.seed(withResource);
      alertRepo.seed(plain);
      alertRepo.attempts.push(sentAttempt(withResource.id, new Date('2026-02-03T13:12:00.000Z')));

      const result = await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

      expect(result.items).toMatchObject([
        {
          id: withResource.id,
          serviceName: 'Limpeza de pele',
          preferredResourceName: 'Carla Menezes',
          notifiedAt: '2026-02-03T13:12:00.000Z',
        },
        {
          id: plain.id,
          serviceName: 'Limpeza de pele',
          preferredResourceName: null,
          notifiedAt: null,
        },
      ]);
    });

    it('leaves notifiedAt null while the email is not SENT (pending or failed)', async () => {
      const alert = aliceAlert().withStatus('NOTIFIED').build();
      alertRepo.seed(alert);
      alertRepo.attempts.push({
        ...sentAttempt(alert.id, new Date('2026-02-03T13:12:00.000Z')),
        outcome: 'FAILED' as never,
      });

      const [item] = (await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER })).items;

      expect(item?.notifiedAt).toBeNull();
    });

    it('reads the names and the sent times once for the page, not once per alert', async () => {
      for (let i = 0; i < 3; i += 1) alertRepo.seed(aliceAlert().build());
      const findServices = jest.spyOn(serviceRepo, 'findByIds');
      const findResources = jest.spyOn(resourceRepo, 'findByIds');
      const findSentAt = jest.spyOn(alertRepo, 'findSentAtByAlertIds');

      await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

      expect(findServices).toHaveBeenCalledTimes(1);
      expect(findResources).toHaveBeenCalledTimes(1);
      expect(findSentAt).toHaveBeenCalledTimes(1);
    });

    it("never resolves another tenant's service name", async () => {
      const foreignService = new ServiceBuilder().withTenantId(OTHER_TENANT).build();
      await serviceRepo.save(foreignService);
      alertRepo.seed(aliceAlert().withServiceId(foreignService.id).build());

      await expect(useCase.execute({ tenantId: TENANT, customerId: CUSTOMER })).rejects.toThrow(
        /not found/,
      );
    });
  });
});
