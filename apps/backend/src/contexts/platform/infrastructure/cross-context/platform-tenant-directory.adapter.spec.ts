import { TenantBuilder } from '../../../../test/builders/platform/index';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { GetTenantsUseCase } from '../../application/use-cases/get-tenants.use-case';
import { PlatformTenantDirectoryAdapter } from './platform-tenant-directory.adapter';

describe('PlatformTenantDirectoryAdapter', () => {
  let repo: InMemoryTenantRepository;
  let adapter: PlatformTenantDirectoryAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    adapter = new PlatformTenantDirectoryAdapter(new GetTenantsUseCase(repo));
  });

  it('returns each active tenant with its id and timezone', async () => {
    const active = new TenantBuilder().build();
    await repo.save(active);

    await expect(adapter.listActiveTenants()).resolves.toEqual([
      { id: active.id, timezone: 'America/Sao_Paulo' },
    ]);
  });

  it('returns an empty list when no tenant exists', async () => {
    await expect(adapter.listActiveTenants()).resolves.toEqual([]);
  });

  it('lists every active tenant and none that was deactivated', async () => {
    const tenantA = new TenantBuilder().withSlug('tenant-a').build();
    const tenantB = new TenantBuilder().withSlug('tenant-b').withTimezone('UTC').build();
    const inactive = new TenantBuilder().withSlug('tenant-c').build();
    inactive.deactivate();
    await repo.save(tenantA);
    await repo.save(tenantB);
    await repo.save(inactive);

    const result = await adapter.listActiveTenants();

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: tenantA.id, timezone: 'America/Sao_Paulo' },
        { id: tenantB.id, timezone: 'UTC' },
      ]),
    );
  });
});
