import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteConfigBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { makeLeadFormQuestions } from '../../../../test/builders/platform/lead-form-config.builder';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryLeadFormConfigRepository } from '../../../../test/repositories/platform/in-memory-lead-form-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import {
  HotsiteCarouselDaysExceedsMaxAdvanceError,
  HotsiteImageNotUploadedError,
  HotsiteNotFoundError,
  PlatformDomainError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { DEFAULT_HOTSITE_BRANDING } from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import { UpdateHotsiteContentUseCase } from './update-hotsite-content.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateHotsiteContentUseCase', () => {
  let repo: InMemoryHotsiteConfigRepository;
  let leadFormConfigRepo: InMemoryLeadFormConfigRepository;
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let useCase: UpdateHotsiteContentUseCase;

  beforeEach(async () => {
    repo = new InMemoryHotsiteConfigRepository();
    leadFormConfigRepo = new InMemoryLeadFormConfigRepository();
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    const imagePathsService = new HotsiteImagePathsService();
    useCase = new UpdateHotsiteContentUseCase(
      repo,
      leadFormConfigRepo,
      tenantRepo,
      new InMemoryTransactionManager(),
      imagePathsService,
      new HotsiteImagePromotionService(storageService, imagePathsService),
      new HotsiteImageUrlResolver(),
      storageService,
    );
    await tenantRepo.save(new TenantBuilder().withId(TENANT_A).build());
  });

  it('throws HotsiteNotFoundError when no config exists for the tenant', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: '#FF5733' } }),
    ).rejects.toBeInstanceOf(HotsiteNotFoundError);
  });

  it('throws TenantNotFoundError when the tenant aggregate does not exist', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildWithContent();
    await repo.save(config);

    await expect(
      useCase.execute({ tenantId: TENANT_B, branding: { primaryColor: '#FF5733' } }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('reads maxBookingAdvanceDays from tenant.settings.booking and rejects an oversized carouselDays', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const layout = [
      {
        type: 'BOOKING_CTA' as const,
        enabled: true,
        data: { title: 'Agende já', ctaLabel: 'Agendar', carouselDays: 91 },
      },
    ];

    await expect(useCase.execute({ tenantId: TENANT_A, layout })).rejects.toBeInstanceOf(
      HotsiteCarouselDaysExceedsMaxAdvanceError,
    );
  });

  it('accepts carouselDays within tenant.settings.booking.maxBookingAdvanceDays', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const layout = [
      {
        type: 'BOOKING_CTA' as const,
        enabled: true,
        data: { title: 'Agende já', ctaLabel: 'Agendar', carouselDays: 90 },
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT_A, layout });
    expect(result.layout).toEqual(layout);
  });

  it('reads the tenant via findByIdForUpdate (not findById) so the carouselDays check locks against a concurrent settings change', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);
    const findByIdForUpdateSpy = jest.spyOn(tenantRepo, 'findByIdForUpdate');
    const findByIdSpy = jest.spyOn(tenantRepo, 'findById');

    await useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: '#FF5733' } });

    expect(findByIdForUpdateSpy).toHaveBeenCalledWith(TENANT_A);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('merges partial branding into the existing branding without wiping other fields', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({
      tenantId: TENANT_A,
      branding: { primaryColor: '#FF5733' },
    });

    expect(result.branding.primaryColor).toBe('#FF5733');
    expect(result.branding.secondaryColor).toBe(DEFAULT_HOTSITE_BRANDING.secondaryColor);
    expect(result.layout).toEqual(config.layout);
  });

  it('replaces the layout when provided', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const newLayout = [
      {
        type: 'SERVICE_LIST' as const,
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT_A, layout: newLayout });

    expect(result.layout).toEqual(newLayout);
    expect(result.branding).toEqual(config.branding);
  });

  it('persists the merged content to the repository', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: '#123456' } });

    const saved = await repo.findByTenantId(TENANT_A);
    expect(saved!.branding.primaryColor).toBe('#123456');
  });

  it('throws PlatformDomainError when branding has an invalid hex color', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(
      useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: 'not-a-color' } }),
    ).rejects.toBeInstanceOf(PlatformDomainError);
  });

  it('throws PlatformDomainError when the layout has an unknown module type', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const layout = [{ type: 'UNKNOWN' as unknown as 'HERO', enabled: true, data: {} }];

    await expect(useCase.execute({ tenantId: TENANT_A, layout })).rejects.toBeInstanceOf(
      PlatformDomainError,
    );
  });

  it('tenant isolation: updating tenant A does not affect tenant B', async () => {
    const configA = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    const configB = new HotsiteConfigBuilder().withTenantId(TENANT_B).buildWithContent();
    await repo.save(configA);
    await repo.save(configB);

    await useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: '#000000' } });

    const savedB = await repo.findByTenantId(TENANT_B);
    expect(savedB!.branding.primaryColor).toBe(DEFAULT_HOTSITE_BRANDING.primaryColor);
  });

  it('sets seo title and description from null defaults', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({
      tenantId: TENANT_A,
      seo: { title: 'Lavacar Estrela — Agendamento Online', description: 'Agende sua lavagem.' },
    });

    expect(result.seo).toEqual({
      title: 'Lavacar Estrela — Agendamento Online',
      description: 'Agende sua lavagem.',
      ogImageUrl: '',
    });
  });

  it('merges a partial seo update without wiping the other field', async () => {
    const config = new HotsiteConfigBuilder()
      .withTenantId(TENANT_A)
      .withSeo({ title: 'Título Original', description: 'Descrição original', ogImageUrl: '' })
      .buildWithContent();
    await repo.save(config);

    const result = await useCase.execute({ tenantId: TENANT_A, seo: { title: 'Novo título' } });

    expect(result.seo.title).toBe('Novo título');
    expect(result.seo.description).toBe('Descrição original');
  });

  it('throws PlatformDomainError when seo.title exceeds 60 characters', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(
      useCase.execute({ tenantId: TENANT_A, seo: { title: 'a'.repeat(61) } }),
    ).rejects.toBeInstanceOf(PlatformDomainError);
  });

  it('throws PlatformDomainError when seo.description exceeds 158 characters', async () => {
    const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
    await repo.save(config);

    await expect(
      useCase.execute({ tenantId: TENANT_A, seo: { description: 'a'.repeat(159) } }),
    ).rejects.toBeInstanceOf(PlatformDomainError);
  });

  // Folded in at M20-S08 (previously a separate near-duplicate use case behind its own PATCH
  // /v1/tenants/lead-form/config endpoint) — cross-aggregate transaction behavior itself is
  // covered by the real-Postgres update-hotsite-content.use-case.integration.spec.ts.
  describe('audienceMode/questions (LeadFormConfig)', () => {
    it('does not touch LeadFormConfig when neither field is provided', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      await useCase.execute({ tenantId: TENANT_A, branding: { primaryColor: '#FF5733' } });

      expect(await leadFormConfigRepo.findByTenantId(TENANT_A)).toBeNull();
    });

    it('creates a new LeadFormConfig when audienceMode is provided and none exists yet', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      await useCase.execute({ tenantId: TENANT_A, audienceMode: 'CUSTOMER_ONLY' });

      const saved = await leadFormConfigRepo.findByTenantId(TENANT_A);
      expect(saved!.audienceMode).toBe('CUSTOMER_ONLY');
      expect(saved!.questions).toEqual([]);
    });

    it('updates questions on an existing LeadFormConfig without requiring audienceMode too', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);
      await useCase.execute({ tenantId: TENANT_A, audienceMode: 'CUSTOMER_ONLY' });

      const questions = makeLeadFormQuestions(2);
      await useCase.execute({ tenantId: TENANT_A, questions });

      const saved = await leadFormConfigRepo.findByTenantId(TENANT_A);
      expect(saved!.audienceMode).toBe('CUSTOMER_ONLY');
      expect(saved!.questions).toHaveLength(2);
    });

    it("never writes audienceMode/questions into layout[]'s LEAD_FORM entry itself", async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      const result = await useCase.execute({
        tenantId: TENANT_A,
        layout: [{ type: 'LEAD_FORM', enabled: true, data: { title: 'Fale com a gente' } }],
        audienceMode: 'CUSTOMER_ONLY',
        questions: makeLeadFormQuestions(1),
      });

      const leadFormModule = result.layout.find((m) => m.type === 'LEAD_FORM');
      expect(leadFormModule!.data).toEqual({ title: 'Fale com a gente' });
    });
  });

  // Field-level promotion/validation mechanics (tmp/ promotion, cross-tenant rejection, every
  // image field type) are unit-tested directly in hotsite-image-promotion.service.spec.ts and
  // hotsite-image-paths.service.spec.ts. These remaining tests cover what's genuinely this use
  // case's own responsibility: wiring the promotion service in correctly, persisting the result,
  // and the before/after path diff that drives delete-previous-on-replace (that diff lives here,
  // not in the promotion service, since it needs the pre-merge stored state).
  describe('tmp/ promotion (TD22)', () => {
    it('promotes a tmp/-referenced logoUrl to a permanent public path, persists it, and calls storage for real', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);
      const tmpPath = `tmp/${TENANT_A}/branding/u1/logo.png`;
      storageService.markAsUploaded(tmpPath);

      const result = await useCase.execute({
        tenantId: TENANT_A,
        branding: { logoUrl: tmpPath },
      });

      const expectedPermanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      // The use case's own response is resolved to a displayable public URL, symmetric with
      // GetHotsiteContentUseCase — only the persisted/repo state stays a raw storage path.
      expect(result.branding.logoUrl).toBe(storageService.getPublicUrl(expectedPermanentPath));

      const saved = await repo.findByTenantId(TENANT_A);
      expect(saved!.branding.logoUrl).toBe(expectedPermanentPath);

      expect(storageService.copiedPaths).toEqual([
        {
          sourcePath: tmpPath,
          destinationPath: expectedPermanentPath,
          destinationBucket: 'public',
        },
      ]);
      expect(storageService.deletedPaths).toEqual([tmpPath]);
    });

    it('promotes a tmp/-referenced seo.ogImageUrl to a permanent public path, same as branding.logoUrl', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);
      const tmpPath = `tmp/${TENANT_A}/seo-og-image/u1/og-image.png`;
      storageService.markAsUploaded(tmpPath);

      const result = await useCase.execute({
        tenantId: TENANT_A,
        seo: { ogImageUrl: tmpPath },
      });

      const expectedPermanentPath = `tenants/${TENANT_A}/hotsite/seo-og-image/u1/og-image.png`;
      expect(result.seo.ogImageUrl).toBe(storageService.getPublicUrl(expectedPermanentPath));

      const saved = await repo.findByTenantId(TENANT_A);
      expect(saved!.seo.ogImageUrl).toBe(expectedPermanentPath);
    });

    it('deletes the previous permanent object when a field changes from one permanent image to another', async () => {
      const oldPermanentPath = `tenants/${TENANT_A}/hotsite/branding/old/logo.png`;
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: oldPermanentPath };
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
      await repo.save(config);
      storageService.markAsUploaded(oldPermanentPath);
      const newTmpPath = `tmp/${TENANT_A}/branding/new/logo.png`;
      storageService.markAsUploaded(newTmpPath);

      await useCase.execute({ tenantId: TENANT_A, branding: { logoUrl: newTmpPath } });

      expect(storageService.deletedPaths).toEqual(
        expect.arrayContaining([oldPermanentPath, newTmpPath]),
      );
    });

    it('does not delete or re-promote anything for an untouched field still pointing at an old permanent image', async () => {
      const permanentPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: permanentPath };
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent(branding);
      await repo.save(config);
      storageService.markAsUploaded(permanentPath);

      const result = await useCase.execute({
        tenantId: TENANT_A,
        seo: { title: 'Novo título' },
      });

      expect(result.branding.logoUrl).toBe(storageService.getPublicUrl(permanentPath));
      expect(storageService.copiedPaths).toEqual([]);
      expect(storageService.deletedPaths).toEqual([]);
    });

    it('propagates HotsiteImageNotUploadedError from the promotion service (e.g. a tmp/ path never actually uploaded)', async () => {
      const config = new HotsiteConfigBuilder().withTenantId(TENANT_A).buildWithContent();
      await repo.save(config);

      await expect(
        useCase.execute({
          tenantId: TENANT_A,
          branding: { logoUrl: `tmp/${TENANT_A}/branding/u1/missing.png` },
        }),
      ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
    });
  });
});
