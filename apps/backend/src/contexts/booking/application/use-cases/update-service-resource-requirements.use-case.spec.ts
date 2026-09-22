import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingServiceHasLegsError,
  BookingServiceResourceTypeUnavailableError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ServiceLeg } from '../../domain/service-leg';
import { UpdateServiceResourceRequirementsUseCase } from './update-service-resource-requirements.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateServiceResourceRequirementsUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: UpdateServiceResourceRequirementsUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new UpdateServiceResourceRequirementsUseCase(
      serviceRepo,
      resourceRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
  });

  it('persists a single flat resource requirement', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const staff = new ResourceBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.STAFF)
      .withRefId(uuidv7())
      .build();
    await resourceRepo.save(staff);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
    });

    expect(result.resourceRequirements).toHaveLength(1);
    expect(result.resourceRequirements[0].type).toBe(ResourceType.STAFF);
  });

  it('reads the service under a row lock (findByIdForUpdate), not a plain findById', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    const staff = new ResourceBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.STAFF)
      .withRefId(uuidv7())
      .build();
    await resourceRepo.save(staff);
    const findByIdForUpdateSpy = jest.spyOn(serviceRepo, 'findByIdForUpdate');
    const findByIdSpy = jest.spyOn(serviceRepo, 'findById');

    await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
    });

    expect(findByIdForUpdateSpy).toHaveBeenCalledWith(service.id, TENANT_A);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('persists a bundle of 2+ requirements', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    await resourceRepo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.STAFF)
        .withRefId(uuidv7())
        .build(),
    );
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.EQUIPMENT).build(),
    );

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      resourceRequirements: [
        { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' },
        { type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' },
      ],
    });

    expect(result.resourceRequirements).toHaveLength(2);
  });

  it('rejects a requirement referencing a type with no active resources (UC-050 A1)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' }],
      }),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('rejects when the service currently has legs (UC-050 A2, 409)', async () => {
    const legs = [
      ServiceLeg.create({
        legIndex: 0,
        name: 'A',
        durationMinutes: 20,
        resourceRequirements: [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ],
      }),
      ServiceLeg.create({
        legIndex: 1,
        name: 'B',
        durationMinutes: 20,
        resourceRequirements: [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ],
      }),
    ];
    const service = new ServiceBuilder().withTenantId(TENANT_A).withLegs(legs).build();
    await serviceRepo.save(service);
    await resourceRepo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.STAFF)
        .withRefId(uuidv7())
        .build(),
    );

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
      }),
    ).rejects.toThrow(BookingServiceHasLegsError);
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(
      useCase.execute({
        id: 'missing',
        tenantId: TENANT_A,
        resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('tenant isolation: a resourcePoolIds entry belonging to another tenant is validated against this tenant only', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    // Only tenant B has an active STAFF resource — tenant A's own lookup must not see it.
    await resourceRepo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_B)
        .withType(ResourceType.STAFF)
        .withRefId(uuidv7())
        .build(),
    );

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
      }),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });
});
