import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  ResourceLocationCannotBeDeactivatedError,
  ResourceNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { DeactivateResourceUseCase } from './deactivate-resource.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('DeactivateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let useCase: DeactivateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    useCase = new DeactivateResourceUseCase(repo, new InMemoryTransactionManager());
  });

  it('deactivates an active resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('throws ResourceLocationCannotBeDeactivatedError for a LOCATION resource', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .build();
    await repo.save(resource);

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceLocationCannotBeDeactivatedError,
    );
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(true);
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id', async () => {
    const resource = new ResourceBuilder()
      .withTenantId('99999999-0000-7000-8000-000000000099')
      .build();
    await repo.save(resource);

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceNotFoundError,
    );
  });
});
