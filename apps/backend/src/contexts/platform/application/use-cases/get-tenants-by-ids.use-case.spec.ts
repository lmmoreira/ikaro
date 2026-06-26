import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantsByIdsUseCase } from './get-tenants-by-ids.use-case';

describe('GetTenantsByIdsUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantsByIdsUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantsByIdsUseCase(repo);
  });

  it('returns an empty array when given an empty list', async () => {
    const result = await useCase.execute([]);

    expect(result).toEqual([]);
  });

  it('returns id, slug, and name for each found tenant', async () => {
    const a = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    const b = new TenantBuilder().withSlug('autospa-sp').withName('AutoSpa SP').build();
    await repo.save(a);
    await repo.save(b);

    const result = await useCase.execute([a.id, b.id]);

    expect(result).toEqual(
      expect.arrayContaining([
        { id: a.id, slug: 'lavacar-bh', name: 'Lavacar BH' },
        { id: b.id, slug: 'autospa-sp', name: 'AutoSpa SP' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('silently omits IDs not found in the repository', async () => {
    const a = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    await repo.save(a);

    const result = await useCase.execute([a.id, 'non-existent-id']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(a.id);
  });

  it('returns a single tenant when given one ID', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-centro').withName('Lavacar Centro').build();
    await repo.save(tenant);

    const result = await useCase.execute([tenant.id]);

    expect(result).toEqual([{ id: tenant.id, slug: 'lavacar-centro', name: 'Lavacar Centro' }]);
  });
});
