import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantByIdUseCase } from './get-tenant-by-id.use-case';

describe('GetTenantByIdUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantByIdUseCase(repo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute('unknown-id')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('returns id, slug, and name for a known tenant', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    await repo.save(tenant);

    const result = await useCase.execute(tenant.id);

    expect(result.id).toBe(tenant.id);
    expect(result.slug).toBe('lavacar-bh');
    expect(result.name).toBe('Lavacar BH');
  });
});
