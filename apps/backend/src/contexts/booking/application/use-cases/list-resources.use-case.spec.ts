import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { ResourceType } from '../../domain/resource.types';
import { ListResourcesUseCase } from './list-resources.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';

describe('ListResourcesUseCase', () => {
  let repo: InMemoryResourceRepository;
  let useCase: ListResourcesUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    useCase = new ListResourcesUseCase(repo);
  });

  it('lists all resources for the tenant', async () => {
    await repo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
    );
    await repo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.EQUIPMENT).build(),
    );
    await repo.save(new ResourceBuilder().withTenantId(OTHER_TENANT_ID).build());

    const result = await useCase.execute({ tenantId: TENANT_ID });

    expect(result.items).toHaveLength(2);
  });

  it('filters by type', async () => {
    await repo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
    );
    await repo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.EQUIPMENT).build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, type: ResourceType.ROOM });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe(ResourceType.ROOM);
  });

  it('filters by isActive', async () => {
    const active = new ResourceBuilder().withTenantId(TENANT_ID).build();
    const inactive = new ResourceBuilder().withTenantId(TENANT_ID).build();
    inactive.deactivate();
    await repo.save(active);
    await repo.save(inactive);

    const result = await useCase.execute({ tenantId: TENANT_ID, isActive: false });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(inactive.id);
  });
});
