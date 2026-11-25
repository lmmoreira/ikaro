import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { SlugPolicy } from '../../domain/slug-policy';
import { CheckSlugAvailabilityUseCase } from './check-slug-availability.use-case';

describe('CheckSlugAvailabilityUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let existsBySlug: jest.SpyInstance;
  let useCase: CheckSlugAvailabilityUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    existsBySlug = jest.spyOn(tenantRepo, 'existsBySlug');
    useCase = new CheckSlugAvailabilityUseCase(new SlugPolicy('ikaro'), tenantRepo);
  });

  it('answers available for a free, valid slug', async () => {
    await expect(useCase.execute({ slug: 'lavacar-top' })).resolves.toEqual({
      status: 'available',
    });
  });

  it('answers taken when a tenant already uses the slug', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    await expect(useCase.execute({ slug: 'lavacar-top' })).resolves.toEqual({ status: 'taken' });
  });

  it('answers reserved for a reserved word, and for the owner slug', async () => {
    await expect(useCase.execute({ slug: 'dashboard' })).resolves.toEqual({ status: 'reserved' });
    await expect(useCase.execute({ slug: 'ikaro' })).resolves.toEqual({ status: 'reserved' });
  });

  it('answers reserved even when a tenant already holds the reserved slug', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('ikaro').build());

    await expect(useCase.execute({ slug: 'ikaro' })).resolves.toEqual({ status: 'reserved' });
  });

  it.each([
    ['ab', 'TOO_SHORT'],
    ['a'.repeat(31), 'TOO_LONG'],
    ['Lavacar', 'INVALID_CHARACTERS'],
    ['-lavacar', 'INVALID_HYPHEN'],
    ['', 'TOO_SHORT'],
  ])('answers invalid with reason for %j', async (slug, reason) => {
    await expect(useCase.execute({ slug })).resolves.toEqual({ status: 'invalid', reason });
  });

  it('never queries the repository for an invalid or reserved slug', async () => {
    await useCase.execute({ slug: 'ab' });
    await useCase.execute({ slug: 'admin' });

    expect(existsBySlug).not.toHaveBeenCalled();
  });

  it('returns only a status, never a tenant field', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    const result = await useCase.execute({ slug: 'lavacar-top' });

    expect(Object.keys(result)).toEqual(['status']);
  });
});
