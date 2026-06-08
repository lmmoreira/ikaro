import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { HotsiteConfigBuilder } from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import {
  HotsiteNotFoundError,
  HotsiteNotPublishedError,
} from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  HotsiteBranding,
  HotsiteModule,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { GetHotsiteManifestUseCase } from './get-hotsite-manifest.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetHotsiteManifestUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let storageService: InMemoryStorageService;
  let useCase: GetHotsiteManifestUseCase;

  beforeEach(() => {
    repo = new InMemoryHotsiteConfigRepository();
    storageService = new InMemoryStorageService();
    useCase = new GetHotsiteManifestUseCase(
      repo,
      storageService,
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
      new HotsiteImageUrlResolver(),
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

  it('resolves stored filePaths to permanent public URLs — branding.logoUrl and GalleryImage.url', async () => {
    const branding: HotsiteBranding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/tenant-a/hotsite/branding/logo.png',
    };
    const layout: HotsiteModule[] = [
      {
        type: 'GALLERY',
        enabled: true,
        data: {
          images: [
            {
              url: 'tenants/tenant-a/hotsite/gallery/photo.jpg',
              source: 'upload',
            },
          ],
          layout: 'grid',
          maxVisible: 6,
        },
      },
    ];
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .buildPublished(branding, layout);
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.branding.logoUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/branding/logo.png'),
    );
    const galleryData = result.layout[0].data as { images: { url: string }[] };
    expect(galleryData.images[0].url).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/gallery/photo.jpg'),
    );
  });

  it('tenant isolation: does not return another tenant published hotsite', async () => {
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(configB);

    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });
});
