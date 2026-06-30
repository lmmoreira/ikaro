import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { DEFAULT_HOTSITE_BRANDING, HotsiteBranding } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';
import { GetHotsiteContentUseCase } from './get-hotsite-content.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetHotsiteContentUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let storageService: InMemoryStorageService;
  let useCase: GetHotsiteContentUseCase;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    storageService = new InMemoryStorageService();
    const reader = new HotsiteContentReader(repo, storageService, new HotsiteImageUrlResolver());
    useCase = new GetHotsiteContentUseCase(reader);
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute({ tenantId: TENANT_A })).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('returns branding, layout, seo, isPublished, and updatedAt regardless of publish status', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.isPublished).toBe(false);
    expect(result.branding).toEqual(config.branding);
    expect(result.layout).toEqual(config.layout);
    expect(result.seo).toEqual(config.seo);
    expect(result.updatedAt).toEqual(config.updatedAt);
  });

  it('resolves branding.logoUrl to the same permanent public URL the public manifest uses', async () => {
    const branding: HotsiteBranding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/tenant-a/hotsite/branding/logo.png',
    };
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.branding.logoUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/branding/logo.png'),
    );
  });

  it('tenant isolation: does not return another tenant hotsite config', async () => {
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(configB);

    await expect(useCase.execute({ tenantId: TENANT_A })).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });
});
