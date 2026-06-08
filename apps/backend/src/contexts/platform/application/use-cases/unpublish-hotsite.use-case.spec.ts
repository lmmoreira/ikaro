import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { Tenant } from '../../domain/tenant.aggregate';
import { UnpublishHotsiteUseCase } from './unpublish-hotsite.use-case';

describe('UnpublishHotsiteUseCase', () => {
  let hotsiteRepo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let frontendRevalidation: InMemoryFrontendRevalidationPort;
  let tenantA: Tenant;
  let useCase: UnpublishHotsiteUseCase;

  beforeEach(async () => {
    hotsiteRepo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    frontendRevalidation = new InMemoryFrontendRevalidationPort();
    tenantA = new TenantBuilder().withSlug('tenant-a').build();
    await tenantRepo.save(tenantA);

    useCase = new UnpublishHotsiteUseCase(
      hotsiteRepo,
      tenantRepo,
      frontendRevalidation,
      new InMemoryTransactionManager(),
      new TenantContextBuilder().withTenantId(tenantA.id).build(),
    );
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('unpublishes a published hotsite and persists the change', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildPublished();
    await hotsiteRepo.save(config);

    const result = await useCase.execute();

    expect(result.isPublished).toBe(false);
    const saved = await hotsiteRepo.findByTenantId(tenantA.id);
    expect(saved!.isPublished).toBe(false);
  });

  it('is idempotent when the hotsite is already unpublished', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildWithContent();
    await hotsiteRepo.save(config);

    const result = await useCase.execute();

    expect(result.isPublished).toBe(false);
  });

  it('triggers frontend revalidation for the tenant slug after unpublishing', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildPublished();
    await hotsiteRepo.save(config);

    await useCase.execute();

    expect(frontendRevalidation.revalidatedSlugs).toEqual([tenantA.slug.value]);
  });

  it('tenant isolation: unpublishing tenant A does not affect tenant B', async () => {
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await tenantRepo.save(tenantB);
    const configA = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildPublished();
    const configB = new HotsiteConfigBuilder().withTenantId(tenantB.id).buildPublished();
    await hotsiteRepo.save(configA);
    await hotsiteRepo.save(configB);

    await useCase.execute();

    const savedB = await hotsiteRepo.findByTenantId(tenantB.id);
    expect(savedB!.isPublished).toBe(true);
  });
});
