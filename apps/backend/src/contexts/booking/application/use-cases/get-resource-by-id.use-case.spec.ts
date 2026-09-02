import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { GetResourceByIdUseCase } from './get-resource-by-id.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('GetResourceByIdUseCase', () => {
  let repo: InMemoryResourceRepository;
  let useCase: GetResourceByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    useCase = new GetResourceByIdUseCase(repo);
  });

  it('returns the resource when it exists', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withName('Camila Duarte')
      .build();
    await repo.save(resource);

    const result = await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

    expect(result).toEqual({
      id: resource.id,
      type: resource.type,
      refId: resource.refId,
      name: 'Camila Duarte',
      workingHours: resource.workingHours,
      turnoverMinutes: resource.turnoverMinutes,
      maxCapacity: resource.maxCapacity,
      isActive: resource.isActive,
    });
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ResourceNotFoundError);
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
