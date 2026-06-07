import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import {
  HotsiteNotFoundError,
  HotsiteNotPublishedError,
} from '../../domain/errors/platform-domain.error';
import { GetHotsiteManifestUseCase } from './get-hotsite-manifest.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetHotsiteManifestUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let useCase: GetHotsiteManifestUseCase;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    useCase = new GetHotsiteManifestUseCase(
      repo,
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
    );
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('throws HotsiteNotPublishedError when the config is not published', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotPublishedError);
  });

  it('returns branding, layout, and isPublished for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.isPublished).toBe(true);
    expect(result.branding).toEqual(config.branding);
    expect(result.layout).toEqual(config.layout);
  });

  it('tenant isolation: does not return another tenant published hotsite', async () => {
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(configB);

    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });
});
