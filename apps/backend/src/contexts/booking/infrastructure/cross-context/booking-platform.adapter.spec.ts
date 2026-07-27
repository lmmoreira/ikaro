import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantsUseCase } from '../../../platform/application/use-cases/get-tenants.use-case';
import { BookingPlatformAdapter } from './booking-platform.adapter';

describe('BookingPlatformAdapter', () => {
  let repo: InMemoryTenantRepository;
  let revalidation: InMemoryFrontendRevalidationPort;
  let adapter: BookingPlatformAdapter;

  beforeEach(() => {
    repo = new InMemoryTenantRepository();
    revalidation = new InMemoryFrontendRevalidationPort();
    adapter = new BookingPlatformAdapter(
      new GetTenantsUseCase(repo),
      new GetTenantByIdUseCase(repo),
      revalidation,
    );
  });

  it('returns all active tenants with their timezones', async () => {
    const active = new TenantBuilder().build();
    await repo.save(active);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
    expect(result[0].timezone).toBe('America/Sao_Paulo');
  });

  it('returns an empty array when no tenants exist', async () => {
    const result = await adapter.findAllActive();
    expect(result).toEqual([]);
  });

  it('resolves independently for two different tenants', async () => {
    const tenantA = new TenantBuilder().withSlug('tenant-a').build();
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await repo.save(tenantA);
    await repo.save(tenantB);

    const result = await adapter.findAllActive();

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining([tenantA.id, tenantB.id]));
  });

  describe('revalidatePublicPages', () => {
    it("resolves the tenant's slug and calls revalidate with it", async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-beloauto').build();
      await repo.save(tenant);

      await adapter.revalidatePublicPages(tenant.id);

      expect(revalidation.revalidatedSlugs).toEqual(['lavacar-beloauto']);
    });

    it('is best-effort — does not throw when the tenant does not exist, and skips revalidate', async () => {
      await expect(adapter.revalidatePublicPages('missing-tenant-id')).resolves.toBeUndefined();
      expect(revalidation.revalidatedSlugs).toEqual([]);
    });
  });
});
