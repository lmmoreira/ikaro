import {
  AvailabilityAlertBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { AvailabilityAlertResultAssembler } from './availability-alert-result.assembler';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';

describe('AvailabilityAlertResultAssembler', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let assembler: AvailabilityAlertResultAssembler;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    alertRepo = new InMemoryAvailabilityAlertRepository();
    assembler = new AvailabilityAlertResultAssembler(serviceRepo, resourceRepo, alertRepo);
  });

  const seedService = async (name: string, tenantId = TENANT) => {
    const service = new ServiceBuilder().withTenantId(tenantId).withName(name).build();
    await serviceRepo.save(service);
    return service;
  };

  const sentAttempt = (
    alertId: string,
    attemptedAt: Date,
    outcome: 'SENT' | 'FAILED' = 'SENT',
  ) => ({
    id: `attempt-${alertId}-${outcome}`,
    tenantId: TENANT,
    alertId,
    matchingWindow: {
      startsAt: new Date('2030-01-01T10:00:00Z'),
      endsAt: new Date('2030-01-01T11:00:00Z'),
    },
    channel: 'EMAIL' as const,
    attemptedAt,
    outcome,
    attemptCount: 1,
    lastError: null,
  });

  it('returns nothing for no alerts, without reading anything', async () => {
    const findServices = jest.spyOn(serviceRepo, 'findByIds');

    await expect(assembler.assemble(TENANT, [])).resolves.toEqual([]);
    expect(findServices).not.toHaveBeenCalled();
  });

  it('carries the service name, the preferred resource name and the sent time', async () => {
    const service = await seedService('Massagem relaxante');
    const resource = new ResourceBuilder().withTenantId(TENANT).withName('Carla Menezes').build();
    await resourceRepo.save(resource);
    const alert = new AvailabilityAlertBuilder()
      .withTenantId(TENANT)
      .withServiceId(service.id)
      .withPreferredResourceId(resource.id)
      .build();
    alertRepo.attempts.push(sentAttempt(alert.id, new Date('2030-01-01T12:30:00.000Z')));

    const [result] = await assembler.assemble(TENANT, [alert]);

    expect(result).toMatchObject({
      id: alert.id,
      serviceName: 'Massagem relaxante',
      preferredResourceName: 'Carla Menezes',
      notifiedAt: '2030-01-01T12:30:00.000Z',
    });
  });

  it('leaves the resource name and notifiedAt null when the alert has neither', async () => {
    const service = await seedService('Limpeza de pele');
    const alert = new AvailabilityAlertBuilder()
      .withTenantId(TENANT)
      .withServiceId(service.id)
      .build();
    alertRepo.attempts.push(sentAttempt(alert.id, new Date('2030-01-01T12:30:00.000Z'), 'FAILED'));

    const result = await assembler.assembleOne(TENANT, alert);

    expect(result).toMatchObject({ preferredResourceName: null, notifiedAt: null });
  });

  it('reads the services, the resources and the sent times once for the whole set', async () => {
    const service = await seedService('Massagem relaxante');
    const alerts = [1, 2, 3].map(() =>
      new AvailabilityAlertBuilder().withTenantId(TENANT).withServiceId(service.id).build(),
    );
    const findServices = jest.spyOn(serviceRepo, 'findByIds');
    const findResources = jest.spyOn(resourceRepo, 'findByIds');
    const findSentAt = jest.spyOn(alertRepo, 'findSentAtByAlertIds');

    const results = await assembler.assemble(TENANT, alerts);

    expect(results).toHaveLength(3);
    expect(findServices).toHaveBeenCalledTimes(1);
    expect(findResources).toHaveBeenCalledTimes(1);
    expect(findSentAt).toHaveBeenCalledTimes(1);
  });

  it("never resolves another tenant's service or resource name", async () => {
    const foreignService = await seedService('Serviço de outro tenant', OTHER_TENANT);
    const alert = new AvailabilityAlertBuilder()
      .withTenantId(TENANT)
      .withServiceId(foreignService.id)
      .build();

    await expect(assembler.assemble(TENANT, [alert])).rejects.toThrow(/Service .* not found/);
  });

  it('fails loudly when a preferred resource cannot be resolved (a broken invariant)', async () => {
    const service = await seedService('Massagem relaxante');
    const foreignResource = new ResourceBuilder().withTenantId(OTHER_TENANT).build();
    await resourceRepo.save(foreignResource);
    const alert = new AvailabilityAlertBuilder()
      .withTenantId(TENANT)
      .withServiceId(service.id)
      .withPreferredResourceId(foreignResource.id)
      .build();

    await expect(assembler.assemble(TENANT, [alert])).rejects.toThrow(/Resource .* not found/);
  });
});
