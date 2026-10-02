import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { ListServiceResourceOptionsUseCase } from './list-service-resource-options.use-case';

const TENANT_A = '10000000-0000-4000-8000-0000000029a1';
const TENANT_B = '10000000-0000-4000-8000-0000000029a2';

const choice = (type: ResourceType, resourcePoolIds: string[] | null = null) =>
  ResourceRequirement.create({ type, selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds });

describe('ListServiceResourceOptionsUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let useCase: ListServiceResourceOptionsUseCase;

  const seedResource = async (
    type: ResourceType,
    name: string,
    opts: { tenantId?: string; active?: boolean } = {},
  ) => {
    const resource = new ResourceBuilder()
      .withTenantId(opts.tenantId ?? TENANT_A)
      .withType(type)
      .withName(name)
      .withRefId(type === ResourceType.STAFF ? uuidv7() : null)
      .build();
    if (opts.active === false) resource.deactivate();
    await resourceRepo.save(resource);
    return resource;
  };

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    useCase = new ListServiceResourceOptionsUseCase(serviceRepo, resourceRepo);
  });

  it('returns only CUSTOMER_CHOICE requirements of a bundle, exposing only id and name', async () => {
    const ana = await seedResource(ResourceType.STAFF, 'Ana');
    await seedResource(ResourceType.ROOM, 'Sala 1');
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([
        choice(ResourceType.STAFF),
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.requirements).toEqual([
      {
        serviceId: service.id,
        legIndex: null,
        resourceType: ResourceType.STAFF,
        selectionMode: 'CUSTOMER_CHOICE',
        requiredQuantity: 1,
        options: [{ resourceId: ana.id, name: 'Ana' }],
      },
    ]);
  });

  it('returns an empty requirements list for a service with no CUSTOMER_CHOICE requirement', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(useCase.execute({ id: service.id, tenantId: TENANT_A })).resolves.toEqual({
      requirements: [],
    });
  });

  it('honours a non-empty pool and treats an empty pool array as unrestricted', async () => {
    const ana = await seedResource(ResourceType.STAFF, 'Ana');
    await seedResource(ResourceType.STAFF, 'Bia');
    const pooled = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF, [ana.id])])
      .build();
    const emptyPool = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF, [])])
      .build();
    await serviceRepo.save(pooled);
    await serviceRepo.save(emptyPool);

    const pooledResult = await useCase.execute({ id: pooled.id, tenantId: TENANT_A });
    const emptyPoolResult = await useCase.execute({ id: emptyPool.id, tenantId: TENANT_A });

    expect(pooledResult.requirements[0].options.map((o) => o.name)).toEqual(['Ana']);
    expect(emptyPoolResult.requirements[0].options.map((o) => o.name)).toEqual(['Ana', 'Bia']);
  });

  it('excludes inactive resources, and returns options: [] when every pool member is inactive', async () => {
    const inactive = await seedResource(ResourceType.STAFF, 'Inativa', { active: false });
    await seedResource(ResourceType.STAFF, 'Ativa');
    const pooled = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF, [inactive.id])])
      .build();
    const unrestricted = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF)])
      .build();
    await serviceRepo.save(pooled);
    await serviceRepo.save(unrestricted);

    const allInactive = await useCase.execute({ id: pooled.id, tenantId: TENANT_A });
    const mixed = await useCase.execute({ id: unrestricted.id, tenantId: TENANT_A });

    expect(allInactive.requirements[0].options).toEqual([]);
    expect(mixed.requirements[0].options.map((o) => o.name)).toEqual(['Ativa']);
  });

  it('returns per-legIndex entries for a legged service', async () => {
    await seedResource(ResourceType.STAFF, 'Ana');
    await seedResource(ResourceType.ROOM, 'Sala 1');
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Avaliação',
          durationMinutes: 30,
          resourceRequirements: [choice(ResourceType.STAFF)],
        }),
        ServiceLeg.create({
          legIndex: 1,
          name: 'Procedimento',
          durationMinutes: 60,
          resourceRequirements: [choice(ResourceType.ROOM)],
        }),
      ])
      .build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.requirements.map((r) => [r.legIndex, r.resourceType])).toEqual([
      [0, ResourceType.STAFF],
      [1, ResourceType.ROOM],
    ]);
  });

  it('orders options by name', async () => {
    await seedResource(ResourceType.STAFF, 'Carla');
    await seedResource(ResourceType.STAFF, 'Ana');
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF)])
      .build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.requirements[0].options.map((o) => o.name)).toEqual(['Ana', 'Carla']);
  });

  it('throws ServiceNotFoundError for an unknown service', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000009999', tenantId: TENANT_A }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it('throws ServiceNotFoundError for an inactive service', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withIsActive(false).build();
    await serviceRepo.save(service);

    await expect(useCase.execute({ id: service.id, tenantId: TENANT_A })).rejects.toBeInstanceOf(
      ServiceNotFoundError,
    );
  });

  it('tenant isolation: a service of tenant A is not found under tenant B, and tenant B resources never appear', async () => {
    await seedResource(ResourceType.STAFF, 'Do Tenant B', { tenantId: TENANT_B });
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withResourceRequirements([choice(ResourceType.STAFF)])
      .build();
    await serviceRepo.save(service);

    await expect(useCase.execute({ id: service.id, tenantId: TENANT_B })).rejects.toBeInstanceOf(
      ServiceNotFoundError,
    );
    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });
    expect(result.requirements[0].options).toEqual([]);
  });
});
