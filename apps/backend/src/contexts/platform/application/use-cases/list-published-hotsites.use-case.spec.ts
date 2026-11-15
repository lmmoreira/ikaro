import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { ListPublishedHotsitesUseCase } from './list-published-hotsites.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('ListPublishedHotsitesUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let access: InMemoryTenantAccessPort;
  let useCase: ListPublishedHotsitesUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    access = new InMemoryTenantAccessPort();
    useCase = new ListPublishedHotsitesUseCase(tenantRepo, hotsiteConfigRepo, access);
  });

  it('returns an empty list when there are no tenants', async () => {
    const result = await useCase.execute();

    expect(result).toEqual({ items: [] });
  });

  it('includes an active tenant with a published hotsite', async () => {
    const tenant = new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build();
    await tenantRepo.save(tenant);
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await hotsiteConfigRepo.save(config);

    const result = await useCase.execute();

    expect(result.items).toEqual([
      { slug: 'lava-rapido', updatedAt: config.updatedAt.toISOString() },
    ]);
  });

  it('excludes an active tenant whose hotsite is not published', async () => {
    const tenant = new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build();
    await tenantRepo.save(tenant);
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await hotsiteConfigRepo.save(config);

    const result = await useCase.execute();

    expect(result.items).toEqual([]);
  });

  it('excludes an active tenant with no hotsite config at all', async () => {
    const tenant = new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute();

    expect(result.items).toEqual([]);
  });

  it('excludes an inactive tenant even if its hotsite is published', async () => {
    const tenant = new TenantBuilder().withId(TENANT_B).withSlug('lava-inativo').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await hotsiteConfigRepo.save(config);

    const result = await useCase.execute();

    expect(result.items).toEqual([]);
  });

  it('excludes a suspended tenant with a published hotsite and keeps the others (tenant isolation)', async () => {
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build());
    await tenantRepo.save(new TenantBuilder().withId(TENANT_B).withSlug('lava-suspenso').build());
    const configA = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await hotsiteConfigRepo.save(configA);
    await hotsiteConfigRepo.save(
      new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished(),
    );
    access.seedSuspended(TENANT_B);

    const result = await useCase.execute();

    expect(result.items).toEqual([
      { slug: 'lava-rapido', updatedAt: configA.updatedAt.toISOString() },
    ]);
  });

  it('reads the suspended ids once for the whole list, never per tenant', async () => {
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build());
    await tenantRepo.save(new TenantBuilder().withId(TENANT_B).withSlug('lava-outro').build());

    await useCase.execute();

    expect(access.listSuspendedCalls).toBe(1);
    expect(access.getAccessCalls).toEqual([]);
  });

  it('lists the tenant again once it is reactivated', async () => {
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build());
    await hotsiteConfigRepo.save(
      new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(),
    );
    access.seedSuspended(TENANT_A);
    await useCase.execute();
    access.reactivate(TENANT_A);

    const result = await useCase.execute();

    expect(result.items.map((i) => i.slug)).toEqual(['lava-rapido']);
  });

  it('fails open when the suspended-ids read throws: every published tenant is listed', async () => {
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSlug('lava-rapido').build());
    await hotsiteConfigRepo.save(
      new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(),
    );
    access.batchReadError = new Error('billing down');

    const result = await useCase.execute();

    expect(result.items.map((i) => i.slug)).toEqual(['lava-rapido']);
  });
});
