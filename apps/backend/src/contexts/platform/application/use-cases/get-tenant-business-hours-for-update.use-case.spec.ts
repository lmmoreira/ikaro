import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantBusinessHoursForUpdateUseCase } from './get-tenant-business-hours-for-update.use-case';

describe('GetTenantBusinessHoursForUpdateUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantBusinessHoursForUpdateUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantBusinessHoursForUpdateUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute({ tenantId: 'unknown-id' })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('returns businessHours and locale for a known tenant', async () => {
    const tenant = new TenantBuilder().build();
    await repo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id });

    expect(result.businessHours).toEqual(tenant.settings.businessHours);
    expect(result.locale).toBe('pt-BR');
  });

  it('reads via findByIdForUpdate, not the cache-backed findById', async () => {
    const tenant = new TenantBuilder().build();
    await repo.save(tenant);
    const forUpdateSpy = jest.spyOn(repo, 'findByIdForUpdate');
    const findByIdSpy = jest.spyOn(repo, 'findById');

    await useCase.execute({ tenantId: tenant.id });

    expect(forUpdateSpy).toHaveBeenCalledWith(tenant.id);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });
});
