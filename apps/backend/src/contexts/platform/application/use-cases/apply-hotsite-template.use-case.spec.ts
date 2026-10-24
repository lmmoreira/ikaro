import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { TenantBuilder, TenantSettingsPropsBuilder } from '../../../../test/builders/platform';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import {
  HotsiteTemplateNotFoundError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { PackageTemplateCatalogueAdapter } from '../../infrastructure/adapters/package-template-catalogue.adapter';
import { HotsiteTemplateMaterializer } from '../services/hotsite-template-materializer.service';
import { ApplyHotsiteTemplateUseCase } from './apply-hotsite-template.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const CONTENT = { branding: {}, layout: [], seo: {} };

function settingsWithLanguage(language: string): TenantSettings {
  return TenantSettings.create(
    new TenantSettingsPropsBuilder().withLocalization({ language }).build(),
  );
}

describe('ApplyHotsiteTemplateUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let storageService: InMemoryStorageService;
  let useCase: ApplyHotsiteTemplateUseCase;

  beforeEach(async () => {
    tenantRepo = new InMemoryTenantRepository();
    storageService = new InMemoryStorageService();
    await tenantRepo.save(
      new TenantBuilder().withId(TENANT_A).withName('Studio Aurora').withSlug('aurora').build(),
    );
    useCase = new ApplyHotsiteTemplateUseCase(
      tenantRepo,
      new PackageTemplateCatalogueAdapter(),
      storageService,
      new HotsiteTemplateMaterializer(),
      new HotsiteImageUrlResolver(),
    );
  });

  it('returns the applied template id and version', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      templateId: 'casa47',
      content: CONTENT,
    });

    expect(result.appliedTemplate).toEqual({ id: 'casa47', version: 1 });
  });

  it('resolves every catalogue image to its public URL', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      templateId: 'casa47',
      content: CONTENT,
    });

    const hero = result.content.layout.find((module) => module.type === 'HERO');
    expect((hero?.data as { backgroundImageUrl: string }).backgroundImageUrl).toBe(
      'http://fake-public-gcs/ikaro-local-public/shared/hotsite-templates/casa47/v1/hero.webp',
    );
  });

  it('is pure: same draft and same language give the same output', async () => {
    const input = { tenantId: TENANT_A, templateId: 'origem', content: CONTENT };

    expect(await useCase.execute(input)).toEqual(await useCase.execute(input));
  });

  it('performs no storage call other than building public URLs', async () => {
    await useCase.execute({ tenantId: TENANT_A, templateId: 'casa47', content: CONTENT });

    expect(storageService.existenceChecks).toEqual([]);
    expect(storageService.uploadedPaths).toEqual([]);
    expect(storageService.readSignedPaths).toEqual([]);
    expect(storageService.copiedPaths).toEqual([]);
    expect(storageService.deletedPaths).toEqual([]);
  });

  it('uses the brand name from the draft in the copy', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      templateId: 'casa47',
      content: {
        ...CONTENT,
        branding: { brandName: 'Barbearia Norte', brandTagline: 'Desde sempre' },
      },
    });

    const chatbot = result.content.layout.find((module) => module.type === 'CHATBOT');
    expect((chatbot?.data as { botName: string }).botName).toBe('Barbearia Norte');
    expect(result.content.branding.brandName).toBe('Barbearia Norte');
  });

  it("falls back to the tenant's name for copy when the draft has no brand name, without changing the draft's branding", async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      templateId: 'casa47',
      content: CONTENT,
    });

    const chatbot = result.content.layout.find((module) => module.type === 'CHATBOT');
    expect((chatbot?.data as { botName: string }).botName).toBe('Studio Aurora');
    expect(result.content.branding).not.toHaveProperty('brandName');
  });

  describe("copy follows the tenant's own language", () => {
    const heroTitle = async (language: string): Promise<string> => {
      await tenantRepo.save(
        new TenantBuilder()
          .withId(TENANT_A)
          .withSlug('aurora')
          .withSettings(settingsWithLanguage(language))
          .build(),
      );
      const result = await useCase.execute({
        tenantId: TENANT_A,
        templateId: 'casa47',
        content: CONTENT,
      });
      const hero = result.content.layout.find((module) => module.type === 'HERO');
      return (hero?.data as { title: string }).title;
    };

    it('uses English copy for an English tenant', async () => {
      expect(await heroTitle('en')).toBe('Your style, at your pace.');
    });

    it('uses English copy for a region-qualified English tag', async () => {
      expect(await heroTitle('en-US')).toBe('Your style, at your pace.');
    });

    it('falls back to Portuguese for any other language', async () => {
      expect(await heroTitle('fr')).toBe('Seu estilo, no seu ritmo.');
    });
  });

  it('fails with the not-found error for a template that is not in the catalogue', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, templateId: 'unknown', content: CONTENT }),
    ).rejects.toThrow(HotsiteTemplateNotFoundError);
  });

  it('tenant isolation: a caller whose tenant does not exist gets the tenant not-found error', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_B, templateId: 'casa47', content: CONTENT }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it("derives the result only from the body draft, never from another tenant's data", async () => {
    await tenantRepo.save(
      new TenantBuilder().withId(TENANT_B).withName('Outro Negócio').withSlug('outro').build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      templateId: 'casa47',
      content: CONTENT,
    });

    expect(JSON.stringify(result)).not.toContain('Outro Negócio');
  });
});
