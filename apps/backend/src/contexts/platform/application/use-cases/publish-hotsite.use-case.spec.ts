import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import {
  HotsiteNotFoundError,
  PlatformDomainError,
} from '../../domain/errors/platform-domain.error';
import { Tenant } from '../../domain/tenant.aggregate';
import { PublishHotsiteUseCase } from './publish-hotsite.use-case';

describe('PublishHotsiteUseCase', () => {
  let hotsiteRepo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let frontendRevalidation: InMemoryFrontendRevalidationPort;
  let tenantA: Tenant;
  let useCase: PublishHotsiteUseCase;

  beforeEach(async () => {
    hotsiteRepo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    frontendRevalidation = new InMemoryFrontendRevalidationPort();
    tenantA = new TenantBuilder().withSlug('tenant-a').build();
    await tenantRepo.save(tenantA);

    useCase = new PublishHotsiteUseCase(
      hotsiteRepo,
      tenantRepo,
      frontendRevalidation,
      new InMemoryTransactionManager(),
    );
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute({ tenantId: tenantA.id })).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('throws PlatformDomainError when the layout has no enabled modules', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).build();
    await hotsiteRepo.save(config);

    await expect(useCase.execute({ tenantId: tenantA.id })).rejects.toBeInstanceOf(PlatformDomainError);
  });

  it('publishes the hotsite and persists the change', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildWithContent();
    await hotsiteRepo.save(config);

    const result = await useCase.execute({ tenantId: tenantA.id });

    expect(result.isPublished).toBe(true);
    const saved = await hotsiteRepo.findByTenantId(tenantA.id);
    expect(saved!.isPublished).toBe(true);
  });

  it('triggers frontend revalidation for the tenant slug after publishing', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildWithContent();
    await hotsiteRepo.save(config);

    await useCase.execute({ tenantId: tenantA.id });

    expect(frontendRevalidation.revalidatedSlugs).toEqual([tenantA.slug.value]);
  });

  it('tenant isolation: publishing tenant A does not affect tenant B', async () => {
    const tenantB = new TenantBuilder().withSlug('tenant-b').build();
    await tenantRepo.save(tenantB);
    const configA = new HotsiteConfigBuilder().withTenantId(tenantA.id).buildWithContent();
    const configB = new HotsiteConfigBuilder().withTenantId(tenantB.id).buildWithContent();
    await hotsiteRepo.save(configA);
    await hotsiteRepo.save(configB);

    await useCase.execute({ tenantId: tenantA.id });

    const savedB = await hotsiteRepo.findByTenantId(tenantB.id);
    expect(savedB!.isPublished).toBe(false);
  });
});
