import { TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantsUseCase } from './get-tenants.use-case';

describe('GetTenantsUseCase', () => {
  let repo: InMemoryTenantRepository;
  let useCase: GetTenantsUseCase;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    useCase = new GetTenantsUseCase(repo);
  });

  it('returns an empty item list when ids filter is empty', async () => {
    const result = await useCase.execute({ ids: [] });

    expect(result.items).toEqual([]);
  });

  it('returns tenant DTOs for matching IDs', async () => {
    const a = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    const b = new TenantBuilder().withSlug('autospa-sp').withName('AutoSpa SP').build();
    await repo.save(a);
    await repo.save(b);

    const result = await useCase.execute({ ids: [a.id, b.id] });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: a.id, slug: 'lavacar-bh', name: 'Lavacar BH' }),
        expect.objectContaining({ id: b.id, slug: 'autospa-sp', name: 'AutoSpa SP' }),
      ]),
    );
    expect(result.items).toHaveLength(2);
  });

  it('filters by active status', async () => {
    const active = new TenantBuilder().withSlug('active').build();
    const inactive = new TenantBuilder().withSlug('inactive').build();
    inactive.deactivate();
    await repo.save(active);
    await repo.save(inactive);

    const result = await useCase.execute({ status: 'ACTIVE' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(active.id);
  });

  it('filters by partial name', async () => {
    const match = new TenantBuilder().withSlug('lavacar-bh').withName('Lavacar BH').build();
    const other = new TenantBuilder().withSlug('autospa-sp').withName('AutoSpa SP').build();
    await repo.save(match);
    await repo.save(other);

    const result = await useCase.execute({ name: 'lava' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(match.id);
  });
});
