import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingServiceLegsTooFewError,
  BookingServiceResourceTypeUnavailableError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { UpdateServiceLegsUseCase } from './update-service-legs.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

const TWO_LEGS = [
  {
    legIndex: 0,
    name: 'Sauna',
    durationMinutes: 20,
    resourceRequirements: [{ type: 'ROOM' as const, selectionMode: 'AUTO_ANY' as const }],
    transitionGapAfterMinutes: 10,
  },
  {
    legIndex: 1,
    name: 'Massagem',
    durationMinutes: 50,
    resourceRequirements: [{ type: 'STAFF' as const, selectionMode: 'CUSTOMER_CHOICE' as const }],
  },
];

describe('UpdateServiceLegsUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: UpdateServiceLegsUseCase;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new UpdateServiceLegsUseCase(
      serviceRepo,
      resourceRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build(),
    );
    await resourceRepo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.STAFF)
        .withRefId(uuidv7())
        .build(),
    );
  });

  it('persists ordered legs with their own nested resource requirements and returns the total span', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, legs: TWO_LEGS });

    expect(result.legs).toHaveLength(2);
    expect(result.legs[0].name).toBe('Sauna');
    expect(result.legs[1].name).toBe('Massagem');
    // 20 + 50 (durations) + 10 (leg 0's own gap; leg 1 has no gap set)
    expect(result.totalSpanMinutes).toBe(80);
  });

  it('reads the service under a row lock (findByIdForUpdate), not a plain findById', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const findByIdForUpdateSpy = jest.spyOn(serviceRepo, 'findByIdForUpdate');
    const findByIdSpy = jest.spyOn(serviceRepo, 'findById');

    await useCase.execute({ id: service.id, tenantId: TENANT_A, legs: TWO_LEGS });

    expect(findByIdForUpdateSpy).toHaveBeenCalledWith(service.id, TENANT_A);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('clears resourceRequirements/bufferAfterMinutes on the service (UC-052 step 3)', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode: 'AUTO_ANY' }),
      ])
      .withBufferAfterMinutes(30)
      .build();
    await serviceRepo.save(service);

    await useCase.execute({ id: service.id, tenantId: TENANT_A, legs: TWO_LEGS });

    const saved = await serviceRepo.findById(service.id, TENANT_A);
    expect(saved!.resourceRequirements).toEqual([]);
    expect(saved!.bufferAfterMinutes).toBeNull();
  });

  it('rejects fewer than 2 legs (UC-052 A1, 422)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_A, legs: [TWO_LEGS[0]] }),
    ).rejects.toThrow(BookingServiceLegsTooFewError);
  });

  it('rejects a leg referencing a resource type with no active resources', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const legsWithUnavailableType = [
      TWO_LEGS[0],
      {
        ...TWO_LEGS[1],
        resourceRequirements: [{ type: 'EQUIPMENT' as const, selectionMode: 'AUTO_ANY' as const }],
      },
    ];

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_A, legs: legsWithUnavailableType }),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(
      useCase.execute({ id: 'missing', tenantId: TENANT_A, legs: TWO_LEGS }),
    ).rejects.toThrow(ServiceNotFoundError);
  });
});
