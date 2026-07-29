import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { HotsiteNotFoundError } from '../../domain/errors/platform-domain.error';
import { DEFAULT_HOTSITE_BRANDING, HotsiteBranding } from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteContentReader } from './hotsite-content-reader.service';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('HotsiteContentReader', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let storageService: InMemoryStorageService;
  let reader: HotsiteContentReader;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    storageService = new InMemoryStorageService();
    reader = new HotsiteContentReader(repo, storageService, new HotsiteImageUrlResolver());
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(reader.readResolved(TENANT_A)).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('returns resolved branding, layout, seo, isPublished, and updatedAt', async () => {
    const branding: HotsiteBranding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/tenant-a/hotsite/branding/logo.png',
    };
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
    await repo.save(config);

    const result = await reader.readResolved(TENANT_A);

    expect(result.branding.logoUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/branding/logo.png'),
    );
    expect(result.layout).toEqual(config.layout);
    expect(result.seo).toEqual(config.seo);
    expect(result.isPublished).toBe(config.isPublished);
    expect(result.updatedAt).toEqual(config.updatedAt);
  });

  it('resolves seo.ogImageUrl to a public URL, same as branding.logoUrl (M18-S03)', async () => {
    const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING };
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({
        title: null,
        description: null,
        ogImageUrl: 'tenants/tenant-a/hotsite/seo-og-image/share.png',
      })
      .buildWithContent(branding);
    await repo.save(config);

    const result = await reader.readResolved(TENANT_A);

    expect(result.seo.ogImageUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/seo-og-image/share.png'),
    );
  });

  it('tenant isolation: does not return another tenant hotsite config', async () => {
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(configB);

    await expect(reader.readResolved(TENANT_A)).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });
});
