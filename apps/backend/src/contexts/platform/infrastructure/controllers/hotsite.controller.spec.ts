import { HttpException, HttpStatus } from '@nestjs/common';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { GetHotsiteManifestUseCase } from '../../application/use-cases/get-hotsite-manifest.use-case';
import { HotsiteController } from './hotsite.controller';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('HotsiteController', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let controller: HotsiteController;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    controller = new HotsiteController(
      new GetHotsiteManifestUseCase(
        repo,
        new TenantContextBuilder().withTenantId(TENANT_A).build(),
      ),
    );
  });

  it('maps HotsiteNotFoundError to 404 when no config exists for the tenant', async () => {
    const err = await controller.getManifest().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps HotsiteNotPublishedError to 404 when the config is not published', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const err = await controller.getManifest().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
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
