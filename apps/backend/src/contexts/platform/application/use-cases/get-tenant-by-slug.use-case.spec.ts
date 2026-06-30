import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantNotFoundError } from '../../domain/errors/platform-domain.error';
import { GetTenantBySlugUseCase } from './get-tenant-by-slug.use-case';

describe('GetTenantBySlugUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantBySlugUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantBySlugUseCase(repo);
  });

  it('throws TenantNotFoundError when slug does not exist', async () => {
    await expect(useCase.execute({ slug: 'no-such-slug' })).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('returns id, slug, and name for a known slug', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    await repo.save(tenant);

    const result = await useCase.execute({ slug: 'lavacar-bh' });

    expect(result.id).toBe(tenant.id);
    expect(result.slug).toBe('lavacar-bh');
    expect(result.name).toBe('Lavacar BH');
  });
});
