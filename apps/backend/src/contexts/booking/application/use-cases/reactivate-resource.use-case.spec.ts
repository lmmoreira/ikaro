import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  ResourceAlreadyActiveError,
  ResourceNotFoundError,
} from '../../domain/errors/resource.error';
import { ReactivateResourceUseCase } from './reactivate-resource.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('ReactivateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let useCase: ReactivateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    useCase = new ReactivateResourceUseCase(repo, new InMemoryTransactionManager());
  });

  it('reactivates an inactive resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    resource.deactivate();
    await repo.save(resource);

    const result = await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

    expect(result.isActive).toBe(true);
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(true);
  });

  it('throws ResourceAlreadyActiveError on an already-active resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceAlreadyActiveError,
    );
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
