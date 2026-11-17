import { HOTSITE_MODULE_FEATURE } from '@ikaro/types';
import {
  HotsiteConfigBuilder,
  TenantBuilder,
  TenantSettingsPropsBuilder,
} from '../../../../test/builders/platform';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
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
import { HotsiteContentReader } from '../services/hotsite-content-reader.service';
import { GetHotsiteManifestUseCase } from './get-hotsite-manifest.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

const HERO: HotsiteModule = {
  type: 'HERO',
  enabled: true,
  data: { variant: 'centered', title: 'T', ctaLabel: 'C', ctaTarget: 'booking-form' },
};

describe('GetHotsiteManifestUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let access: InMemoryTenantAccessPort;
  let useCase: GetHotsiteManifestUseCase;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    access = new InMemoryTenantAccessPort();
    const reader = new HotsiteContentReader(repo, storageService, new HotsiteImageUrlResolver());
    useCase = new GetHotsiteManifestUseCase(tenantRepo, reader, access);
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).build());
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(useCase.execute({ tenantId: TENANT_A })).rejects.toBeInstanceOf(
      HotsiteNotFoundError,
    );
  });

  it('returns a minimal payload (empty layout, null business) when the hotsite is not published', async () => {
    const branding: HotsiteBranding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/tenant-a/hotsite/branding/logo.png',
    };
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

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
    expect(result.seo).toEqual({ title: null, description: null, ogImageUrl: '' });
    expect(result.booking).toEqual({ maxBookingAdvanceDays: 90 });
  });

  it('returns branding, layout, and isPublished for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.isPublished).toBe(true);
    expect(result.branding).toEqual(config.branding);
    expect(result.layout).toEqual(config.layout);
    expect(result.booking).toEqual({ maxBookingAdvanceDays: 90 });
  });

  it('returns booking.maxBookingAdvanceDays from tenant.settings.booking for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);
    const settings = TenantSettings.create(
      new TenantSettingsPropsBuilder().withBooking({ maxBookingAdvanceDays: 45 }).build(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSettings(settings).build());

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.booking).toEqual({ maxBookingAdvanceDays: 45 });
  });

  it('returns the tenant-configured seo title and description for a published hotsite', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende já.',
        ogImageUrl: '',
      })
      .buildPublished();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.seo).toEqual({
      title: 'Lavacar Estrela — Agendamento Online',
      description: 'Agende já.',
      ogImageUrl: '',
    });
  });

  it('resolves seo.ogImageUrl to a full public URL, same as branding.logoUrl', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({
        title: null,
        description: null,
        ogImageUrl: 'tenants/tenant-a/hotsite/seo-og-image/og-image.png',
      })
      .buildPublished();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.seo.ogImageUrl).toBe(
      storageService.getPublicUrl('tenants/tenant-a/hotsite/seo-og-image/og-image.png'),
    );
  });

  it('throws TenantNotFoundError when the tenant aggregate does not exist', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished();
    await repo.save(config);
    const reader = new HotsiteContentReader(repo, storageService, new HotsiteImageUrlResolver());
    const useCaseForB = new GetHotsiteManifestUseCase(tenantRepo, reader, access);

    await expect(useCaseForB.execute({ tenantId: TENANT_B })).rejects.toBeInstanceOf(
      TenantNotFoundError,
    );
  });

  it('returns business resolved from tenant.settings.businessInfo', async () => {
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
            zipCode: '01310100',
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

    const result = await useCase.execute({ tenantId: TENANT_A });

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

  it('returns null business fields when tenant.settings.businessInfo is unset', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.business).toEqual({ phone: null, email: null, address: null, socialLinks: null });
  });

  it('returns localization.language from tenant.settings.localization', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished();
    await repo.save(config);
    const settings = TenantSettings.create(
      new TenantSettingsPropsBuilder().withLocalization({ language: 'en-US' }).build(),
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).withSettings(settings).build());

    const result = await useCase.execute({ tenantId: TENANT_A });

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

    const result = await useCase.execute({ tenantId: TENANT_A });

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

    await expect(useCase.execute({ tenantId: TENANT_A })).rejects.toBeInstanceOf(
      HotsiteNotFoundError,
    );
  });

  describe('effective published (UC-122)', () => {
    it.each([
      { flag: true, operational: true, expected: true },
      { flag: true, operational: false, expected: false },
      { flag: false, operational: true, expected: false },
      { flag: false, operational: false, expected: false },
    ])(
      'effective isPublished is the manager flag && operational (%j)',
      async ({ flag, operational, expected }) => {
        const builder = new HotsiteConfigBuilder().withTenantId(TENANT_A);
        await repo.save(flag ? builder.buildPublished() : builder.buildWithContent());
        if (!operational) access.seedSuspended(TENANT_A);

        const result = await useCase.execute({ tenantId: TENANT_A });

        expect(result.isPublished).toBe(expected);
      },
    );

    it('a suspended tenant keeps its branding and gets the minimal unpublished payload', async () => {
      const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, primaryColor: '#123456' };
      await repo.save(new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(branding));
      access.seedSuspended(TENANT_A);

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.isPublished).toBe(false);
      expect(result.branding.primaryColor).toBe('#123456');
      expect(result.layout).toEqual([]);
      expect(result.business).toEqual({
        phone: null,
        email: null,
        address: null,
        socialLinks: null,
      });
    });

    it('never changes the manager flag: the stored config stays published while suspended', async () => {
      await repo.save(new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished());
      access.seedSuspended(TENANT_A);

      await useCase.execute({ tenantId: TENANT_A });

      expect((await repo.findByTenantId(TENANT_A))?.isPublished).toBe(true);
    });

    it('keeps the unknown-tenant path distinct: TenantNotFoundError, never an unpublished 200', async () => {
      await repo.save(new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished());
      access.seedSuspended(TENANT_B);

      await expect(useCase.execute({ tenantId: TENANT_B })).rejects.toBeInstanceOf(
        TenantNotFoundError,
      );
    });

    it('fails open when the access lookup throws: the hotsite is served as published', async () => {
      await repo.save(new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished());
      access.getAccessError = new Error('billing down');

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.isPublished).toBe(true);
      expect(result.layout.length).toBeGreaterThan(0);
    });

    it('an operational tenant with every feature gets the layout untouched (exempt non-regression)', async () => {
      const layout: HotsiteModule[] = [
        HERO,
        { type: 'CHATBOT', enabled: true, data: { variant: 'bubble' } },
      ];
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layout),
      );

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.layout.map((m) => m.type)).toEqual(['HERO', 'CHATBOT']);
    });
  });

  describe('module filtering by entitlement (UC-122)', () => {
    const layout: HotsiteModule[] = [
      HERO,
      { type: 'CHATBOT', enabled: true, data: { variant: 'bubble' } },
      { type: 'LEAD_FORM', enabled: true, data: { title: 'Fale conosco', ctaLabel: 'Enviar' } },
    ];

    const withoutFeatures = (...missing: string[]) => ({
      status: 'ACTIVE' as const,
      suspensionReason: null,
      operational: true,
      features: (['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const)
        .filter((key) => !missing.includes(key))
        .map((key) => ({ key, tier: 'STANDARD' as const })),
    });

    it('omits LEAD_FORM and CHATBOT modules the tenant is not entitled to, keeping the rest', async () => {
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layout),
      );
      access.seed(TENANT_A, withoutFeatures('LEAD_FORM', 'CHATBOT'));

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.layout.map((m) => m.type)).toEqual(['HERO']);
    });

    it('omits only the module of the missing feature', async () => {
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layout),
      );
      access.seed(TENANT_A, withoutFeatures('LEAD_FORM'));

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.layout.map((m) => m.type)).toEqual(['HERO', 'CHATBOT']);
    });

    // The contract for every feature that gates a hotsite surface, over the map itself: a new gated
    // module type needs a fixture here, so it cannot ship without its omission being checked.
    describe('every feature that gates a hotsite module', () => {
      const FIXTURES: Record<string, HotsiteModule> = {
        SERVICE_LIST: {
          type: 'SERVICE_LIST',
          enabled: true,
          data: { showPrices: true, showPoints: false, layout: 'grid' },
        },
        BOOKING_CTA: {
          type: 'BOOKING_CTA',
          enabled: true,
          data: { title: 'Agende', ctaLabel: 'Agendar' },
        },
        CHATBOT: { type: 'CHATBOT', enabled: true, data: { variant: 'bubble' } },
        LEAD_FORM: {
          type: 'LEAD_FORM',
          enabled: true,
          data: { title: 'Fale conosco', ctaLabel: 'Enviar' },
        },
      };
      const gated = Object.entries(HOTSITE_MODULE_FEATURE);
      const gatingFeatures = [...new Set(gated.map(([, feature]) => feature))];

      it('has a fixture for every gated module type', () => {
        expect(Object.keys(FIXTURES).sort()).toEqual(gated.map(([type]) => type).sort());
      });

      it.each(gatingFeatures)(
        'omits exactly the modules %s gates, keeps the rest and lists only %s as unavailable',
        async (missing) => {
          const layoutAll = [HERO, ...Object.values(FIXTURES)];
          await repo.save(
            new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layoutAll),
          );
          access.seed(TENANT_A, withoutFeatures(missing));

          const result = await useCase.execute({ tenantId: TENANT_A });

          const omitted = gated.filter(([, feature]) => feature === missing).map(([type]) => type);
          const kept = layoutAll.map((m) => m.type).filter((type) => !omitted.includes(type));
          expect(result.layout.map((m) => m.type)).toEqual(kept);
          expect(result.unavailableFeatures).toEqual([missing]);
        },
      );
    });

    describe('BOOKING', () => {
      const bookingLayout: HotsiteModule[] = [
        HERO,
        {
          type: 'SERVICE_LIST',
          enabled: true,
          data: { showPrices: true, showPoints: false, layout: 'grid' },
        },
        { type: 'BOOKING_CTA', enabled: true, data: { title: 'Agende', ctaLabel: 'Agendar' } },
      ];

      it('omits the service list and the booking call to action and reports BOOKING unavailable for a tenant without it', async () => {
        await repo.save(
          new HotsiteConfigBuilder()
            .withTenantId(TENANT_A)
            .buildPublished(undefined, bookingLayout),
        );
        access.seed(TENANT_A, withoutFeatures('BOOKING'));

        const result = await useCase.execute({ tenantId: TENANT_A });

        expect(result.layout.map((m) => m.type)).toEqual(['HERO']);
        expect(result.unavailableFeatures).toEqual(['BOOKING']);
      });

      it('keeps both modules and does not report BOOKING unavailable for a tenant holding it (negative guarantee)', async () => {
        await repo.save(
          new HotsiteConfigBuilder()
            .withTenantId(TENANT_A)
            .buildPublished(undefined, bookingLayout),
        );
        access.seed(TENANT_A, withoutFeatures('LEAD_FORM'));

        const result = await useCase.execute({ tenantId: TENANT_A });

        expect(result.layout.map((m) => m.type)).toEqual(['HERO', 'SERVICE_LIST', 'BOOKING_CTA']);
        expect(result.unavailableFeatures).toEqual(['LEAD_FORM']);
      });

      it('publishes only the features that gate a hotsite surface, never the rest of the plan', async () => {
        await repo.save(new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished());
        access.seed(TENANT_A, withoutFeatures('LOYALTY', 'LEAD_FORM', 'CHATBOT'));

        const result = await useCase.execute({ tenantId: TENANT_A });

        expect(result.unavailableFeatures).toEqual(['LEAD_FORM', 'CHATBOT']);
      });

      it('fails open when the access lookup throws: no feature is reported unavailable', async () => {
        await repo.save(
          new HotsiteConfigBuilder()
            .withTenantId(TENANT_A)
            .buildPublished(undefined, bookingLayout),
        );
        access.getAccessError = new Error('billing down');

        const result = await useCase.execute({ tenantId: TENANT_A });

        expect(result.unavailableFeatures).toEqual([]);
        expect(result.layout).toHaveLength(3);
      });
    });

    it('preserves the stored module settings: the module returns untouched when the entitlement does', async () => {
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layout),
      );
      access.seed(TENANT_A, withoutFeatures('LEAD_FORM'));
      await useCase.execute({ tenantId: TENANT_A });
      access.reactivate(TENANT_A);

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.layout.find((m) => m.type === 'LEAD_FORM')?.data).toEqual({
        title: 'Fale conosco',
        ctaLabel: 'Enviar',
      });
      expect((await repo.findByTenantId(TENANT_A))?.layout.map((m) => m.type)).toEqual([
        'HERO',
        'CHATBOT',
        'LEAD_FORM',
      ]);
    });

    it("tenant isolation: tenant B's suspension never affects tenant A", async () => {
      await tenantRepo.save(new TenantBuilder().withId(TENANT_B).build());
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_A).buildPublished(undefined, layout),
      );
      await repo.save(
        new HotsiteConfigBuilder().withTenantId(TENANT_B).buildPublished(undefined, layout),
      );
      access.seedSuspended(TENANT_B);

      const result = await useCase.execute({ tenantId: TENANT_A });

      expect(result.isPublished).toBe(true);
      expect(result.layout.map((m) => m.type)).toEqual(['HERO', 'CHATBOT', 'LEAD_FORM']);
    });
  });
});
