import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import {
  HotsiteConfigBuilder,
  TenantBuilder,
  TenantSettingsPropsBuilder,
} from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import {
  HotsiteNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  HotsiteBranding,
  HotsiteModule,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { GetHotsiteManifestUseCase } from './get-hotsite-manifest.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetHotsiteManifestUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let useCase: GetHotsiteManifestUseCase;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    useCase = new GetHotsiteManifestUseCase(
      repo,
      tenantRepo,
      storageService,
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
      new HotsiteImageUrlResolver(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).build());
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute()).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('returns a minimal payload (empty layout, null business) when the hotsite is not published', async () => {
    const branding: HotsiteBranding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/tenant-a/hotsite/branding/logo.png',
    };
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.isPublished).toBe(false);
    expect(result.layout).toEqual([]);
    expect(result.branding.logoUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/branding/logo.png'),
    );
    expect(result.business).toEqual({
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
    });
    expect(result.localization).toEqual(
      expect.objectContaining({ language: 'pt-BR', currency: 'BRL', phonePrefix: '+55' }),
    );
    expect(result.seo).toEqual({ title: null, description: null });
  });

  it('returns branding, layout, and isPublished for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.isPublished).toBe(true);
    expect(result.branding).toEqual(config.branding);
    expect(result.layout).toEqual(config.layout);
  });

  it('returns the tenant-configured seo title and description for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({ title: 'Lavacar Estrela — Agendamento Online', description: 'Agende já.' })
      .buildPublished();
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.seo).toEqual({
      title: 'Lavacar Estrela — Agendamento Online',
      description: 'Agende já.',
    });
  });

  it('throws TenantNotFoundError when the tenant aggregate does not exist', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(config);
    const useCaseForB = new GetHotsiteManifestUseCase(
      repo,
      tenantRepo,
      storageService,
      new TenantContextBuilder().withTenantId(TENANT_B).build(),
      new HotsiteImageUrlResolver(),
    );

    await expect(useCaseForB.execute()).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('returns business resolved from tenant.settings.business_info', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);
    const settings = TenantSettings.create(
      new TenantSettingsPropsBuilder()
        .withBusinessInfo({
          phone: '+5511987654321',
          email: 'contato@beloauto.com.br',
          address: {
            street: 'Av. Paulista',
            number: '1000',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
            zip_code: '01310100',
          },
        })
        .withSocialLinks({
          whatsapp: '+5511987654321',
          instagram: 'https://instagram.com/lavacar',
          facebook: null,
        })
        .build(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSettings(settings).build());

    const result = await useCase.execute();

    expect(result.business).toEqual({
      phone: '+5511987654321',
      email: 'contato@beloauto.com.br',
      address: {
        street: 'Av. Paulista',
        number: '1000',
        complement: undefined,
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310100',
      },
      socialLinks: {
        whatsapp: '+5511987654321',
        instagram: 'https://instagram.com/lavacar',
        facebook: null,
      },
    });
  });

  it('returns null business fields when tenant.settings.business_info is unset', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await useCase.execute();

    expect(result.business).toEqual({ phone: null, email: null, address: null, socialLinks: null });
  });

  it('returns localization.language from tenant.settings.localization', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);
    const settings = TenantSettings.create(
      new TenantSettingsPropsBuilder().withLocalization({ language: 'en-US' }).build(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSettings(settings).build());

    const result = await useCase.execute();

    expect(result.localization.language).toBe('en-US');
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
