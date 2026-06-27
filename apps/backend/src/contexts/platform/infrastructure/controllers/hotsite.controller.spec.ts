import { HttpException, HttpStatus } from '@nestjs/common';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteContentReader } from '../../application/services/hotsite-content-reader.service';
import { GetHotsiteManifestUseCase } from '../../application/use-cases/get-hotsite-manifest.use-case';
import { HotsiteController } from './hotsite.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('HotsiteController', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let controller: HotsiteController;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    const tenantRepo = new InMemoryTenantRepository();
    const storageService = new InMemoryStorageService();
    const reader = new HotsiteContentReader(repo, storageService, new HotsiteImageUrlResolver());
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).build());
    controller = new HotsiteController(
      new GetHotsiteManifestUseCase(
        tenantRepo,
        new RequestContextBuilder().withTenantId(TENANT_A).build(),
        reader,
      ),
    );
  });

  it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
    const err = await controller.getManifest().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns 200 with isPublished: false and an empty layout when the config is not published', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await controller.getManifest();

    expect(result.isPublished).toBe(false);
    expect(result.layout).toEqual([]);
    expect(result.business).toEqual({
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
    });
  });

  it('returns branding, layout, and isPublished for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await controller.getManifest();

    expect(result.isPublished).toBe(true);
    expect(result.branding).toEqual(config.branding);
    expect(result.layout).toEqual(config.layout);
  });
});
