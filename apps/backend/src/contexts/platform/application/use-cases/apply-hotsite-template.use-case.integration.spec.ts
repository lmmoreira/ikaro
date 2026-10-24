import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { TenantBuilder } from '../../../../test/builders/platform';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteConfig,
  HotsiteModule,
  HotsiteModuleData,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from '../../domain/services/hotsite-image-url-resolver.service';
import { PackageTemplateCatalogueAdapter } from '../../infrastructure/adapters/package-template-catalogue.adapter';
import { HotsiteConfigEntity } from '../../infrastructure/entities/hotsite-config.entity';
import { LeadFormConfigEntity } from '../../infrastructure/entities/lead-form-config.entity';
import { TenantEntity } from '../../infrastructure/entities/tenant.entity';
import { TypeOrmHotsiteConfigRepository } from '../../infrastructure/repositories/typeorm-hotsite-config.repository';
import { TypeOrmLeadFormConfigRepository } from '../../infrastructure/repositories/typeorm-lead-form-config.repository';
import { TypeOrmTenantRepository } from '../../infrastructure/repositories/typeorm-tenant.repository';
import { UpdateHotsiteContentDto } from '../dtos/update-hotsite-content.dto';
import { HotsiteImagePromotionService } from '../services/hotsite-image-promotion.service';
import { HotsiteTemplateMaterializer } from '../services/hotsite-template-materializer.service';
import { ApplyHotsiteTemplateUseCase } from './apply-hotsite-template.use-case';
import { UpdateHotsiteContentUseCase } from './update-hotsite-content.use-case';

const PUBLIC_BASE = 'http://fake-public-gcs/ikaro-local-public/';

function mod(type: HotsiteModule['type'], enabled: boolean, data: object): HotsiteModule {
  return { type, enabled, data: data as HotsiteModuleData };
}

// What the web does before it sends a draft back: resolved public URLs become storage paths again.
function toPaths(layout: HotsiteModule[]): HotsiteModule[] {
  return JSON.parse(JSON.stringify(layout).split(PUBLIC_BASE).join('')) as HotsiteModule[];
}

describe('ApplyHotsiteTemplateUseCase (integration — real Postgres)', () => {
  let dataSource: DataSource;
  let tenantRepo: TypeOrmTenantRepository;
  let hotsiteConfigRepo: TypeOrmHotsiteConfigRepository;
  let storage: InMemoryStorageService;
  let apply: ApplyHotsiteTemplateUseCase;
  let update: UpdateHotsiteContentUseCase;
  let slugCounter = 0;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    tenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    hotsiteConfigRepo = new TypeOrmHotsiteConfigRepository(
      dataSource.getRepository(HotsiteConfigEntity),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(() => {
    storage = new InMemoryStorageService();
    const imagePathsService = new HotsiteImagePathsService();
    const catalogue = new PackageTemplateCatalogueAdapter();
    apply = new ApplyHotsiteTemplateUseCase(
      tenantRepo,
      catalogue,
      storage,
      new HotsiteTemplateMaterializer(),
      new HotsiteImageUrlResolver(),
    );
    update = new UpdateHotsiteContentUseCase(
      hotsiteConfigRepo,
      new TypeOrmLeadFormConfigRepository(dataSource.getRepository(LeadFormConfigEntity)),
      tenantRepo,
      new TypeOrmTransactionManager(dataSource),
      imagePathsService,
      new HotsiteImagePromotionService(storage, imagePathsService, catalogue),
      new HotsiteImageUrlResolver(),
      storage,
    );
  });

  async function seedTenant(layout: HotsiteModule[], publish: boolean): Promise<string> {
    slugCounter += 1;
    const tenant = new TenantBuilder()
      .withSlug(`apply-template-${slugCounter}-${Date.now()}`)
      .build();
    await tenantRepo.save(tenant);
    const config = HotsiteConfig.create(tenant.id);
    config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
      maxBookingAdvanceDays: 365,
    });
    if (publish) config.publish();
    await hotsiteConfigRepo.save(config);
    return tenant.id;
  }

  it('returns catalogue image URLs and persists nothing: version and isPublished are unchanged', async () => {
    const tenantId = await seedTenant([mod('ABOUT', true, { title: 'x', body: 'y' })], true);
    const before = await hotsiteConfigRepo.findByTenantId(tenantId);

    const result = await apply.execute({
      tenantId,
      templateId: 'casa47',
      content: { branding: {}, layout: [], seo: {} },
    });

    const hero = result.content.layout.find((m) => m.type === 'HERO');
    expect((hero?.data as { backgroundImageUrl: string }).backgroundImageUrl).toBe(
      `${PUBLIC_BASE}shared/hotsite-templates/casa47/v1/hero.webp`,
    );
    const after = await hotsiteConfigRepo.findByTenantId(tenantId);
    expect(after?.version).toBe(before?.version);
    expect(after?.isPublished).toBe(true);
    expect(after?.layout).toEqual(before?.layout);
    expect(storage.existenceChecks).toEqual([]);
  });

  it('saves the applied draft: catalogue paths are accepted with no storage existence call', async () => {
    const tenantId = await seedTenant([mod('ABOUT', true, { title: 'x', body: 'y' })], false);
    const applied = await apply.execute({
      tenantId,
      templateId: 'lume-studio',
      content: { branding: {}, layout: [], seo: {} },
    });

    const saved = await update.execute({
      tenantId,
      branding: applied.content.branding,
      layout: toPaths(applied.content.layout) as UpdateHotsiteContentDto['layout'],
      seo: applied.content.seo,
    });

    expect(saved.layout.map((m) => m.type)).toEqual(applied.content.layout.map((m) => m.type));
    expect(storage.existenceChecks.filter((path) => path.startsWith('shared/'))).toEqual([]);
    const reloaded = await hotsiteConfigRepo.findByTenantId(tenantId);
    expect(JSON.stringify(reloaded?.layout)).toContain(
      'shared/hotsite-templates/lume-studio/v1/hero.webp',
    );
  });

  it('applying the template over its own saved result is stable (the round trip)', async () => {
    const tenantId = await seedTenant([mod('ABOUT', true, { title: 'x', body: 'y' })], false);
    const first = await apply.execute({
      tenantId,
      templateId: 'casa47',
      content: { branding: {}, layout: [], seo: {} },
    });
    await update.execute({
      tenantId,
      branding: first.content.branding,
      layout: toPaths(first.content.layout) as UpdateHotsiteContentDto['layout'],
      seo: first.content.seo,
    });
    const reread = await hotsiteConfigRepo.findByTenantId(tenantId);

    const second = await update.execute({
      tenantId,
      branding: reread?.branding,
      layout: reread?.layout as UpdateHotsiteContentDto['layout'],
      seo: reread?.seo,
    });

    expect(second.layout.map((m) => m.type)).toEqual(first.content.layout.map((m) => m.type));
  });

  it('rejects an unregistered shared/ path on save', async () => {
    const tenantId = await seedTenant([mod('ABOUT', true, { title: 'x', body: 'y' })], false);

    await expect(
      update.execute({
        tenantId,
        layout: [
          mod('ABOUT', true, {
            title: 'x',
            body: 'y',
            imageUrl: 'shared/hotsite-templates/casa47/v1/not-released.webp',
          }),
        ] as UpdateHotsiteContentDto['layout'],
      }),
    ).rejects.toBeInstanceOf(HotsiteImageNotUploadedError);
  });

  it('schedules deletion of exactly the superseded tenant-owned images, never the gallery or a shared object', async () => {
    slugCounter += 1;
    const tenant = new TenantBuilder()
      .withSlug(`apply-template-del-${slugCounter}-${Date.now()}`)
      .build();
    await tenantRepo.save(tenant);
    const hero = `tenants/${tenant.id}/hotsite/hero/u1/hero.jpg`;
    const about = `tenants/${tenant.id}/hotsite/about/u1/about.jpg`;
    const galleryImage = `tenants/${tenant.id}/hotsite/gallery/u1/g.jpg`;
    [hero, about, galleryImage].forEach((path) => storage.markAsUploaded(path));
    const config = HotsiteConfig.create(tenant.id);
    config.updateContent(
      DEFAULT_HOTSITE_BRANDING,
      [
        mod('HERO', true, { variant: 'centered', title: 'H', backgroundImageUrl: hero }),
        mod('ABOUT', true, { title: 'A', body: 'B', imageUrl: about }),
        mod('GALLERY', true, { images: [{ url: galleryImage, source: 'upload' }] }),
      ],
      DEFAULT_HOTSITE_SEO,
      { maxBookingAdvanceDays: 365 },
    );
    await hotsiteConfigRepo.save(config);
    const draft = await hotsiteConfigRepo.findByTenantId(tenant.id);

    const applied = await apply.execute({
      tenantId: tenant.id,
      templateId: 'casa47',
      content: {
        branding: {},
        layout: toPaths(draft!.layout) as UpdateHotsiteContentDto['layout'] as never,
        seo: {},
      },
    });
    await update.execute({
      tenantId: tenant.id,
      branding: applied.content.branding,
      layout: toPaths(applied.content.layout) as UpdateHotsiteContentDto['layout'],
      seo: applied.content.seo,
    });

    expect([...storage.deletedPaths].sort()).toEqual([hero, about].sort());
    expect(storage.deletedPaths.some((path) => path.startsWith('shared/'))).toBe(false);
  });
});
