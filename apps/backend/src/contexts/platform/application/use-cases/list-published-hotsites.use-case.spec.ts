import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { ListPublishedHotsitesUseCase } from './list-published-hotsites.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('ListPublishedHotsitesUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let hotsiteConfigRepo: InMemoryHotsiteConfigRepository;
  let useCase: ListPublishedHotsitesUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    hotsiteConfigRepo = new InMemoryHotsiteConfigRepository();
    useCase = new ListPublishedHotsitesUseCase(tenantRepo, hotsiteConfigRepo);
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
});
