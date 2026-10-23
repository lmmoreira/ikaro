import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { makeLeadFormQuestions } from '../../../../test/builders/platform/lead-form-config.builder';
import { STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryFrontendRevalidationPort } from '../../../../test/infrastructure/in-memory-frontend-revalidation.port';
import { FRONTEND_REVALIDATION_PORT } from '../../application/ports/frontend-revalidation.port';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { LeadFormConfigEntity } from '../entities/lead-form-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

const TENANT_A = 'c2d3e4f5-0000-0000-0000-000000000001';
const TENANT_B = 'c2d3e4f5-0000-0000-0000-000000000002';
const TENANT_NO_HOTSITE = 'c2d3e4f5-0000-0000-0000-000000000003';
const TENANT_LAYOUT = 'c2d3e4f5-0000-0000-0000-000000000004';
const BOOKING_ID = 'c2d3e4f5-0000-4000-8000-000000000001';
const AFTER_PHOTO = `tenants/${TENANT_A}/bookings/${BOOKING_ID}/after-1.jpg`;
const OTHER_TENANT_PHOTO = `tenants/${TENANT_B}/bookings/${BOOKING_ID}/after-1.jpg`;

async function saveHotsiteConfig(
  ds: DataSource,
  tenantId: string,
  published: boolean,
): Promise<void> {
  const entity = new HotsiteConfigEntityBuilder()
    .withId(`d${tenantId.slice(1)}`)
    .withTenantId(tenantId)
    .withIsPublished(published)
    .build();

  await ds.getRepository(HotsiteConfigEntity).save(entity);
}

describe('HotsiteAdminController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storageService: InMemoryStorageService;
  let frontendRevalidation: InMemoryFrontendRevalidationPort;

  beforeAll(async () => {
    ({ app, ds } = await createPlatformIntegrationApp());
    storageService = app.get(STORAGE_SERVICE);
    frontendRevalidation = app.get(FRONTEND_REVALIDATION_PORT);

    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_A).withSlug('hotsite-admin-tenant-a').build());
    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_B).withSlug('hotsite-admin-tenant-b').build());
    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_NO_HOTSITE)
          .withSlug('hotsite-admin-tenant-c')
          .build(),
      );

    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_LAYOUT)
          .withSlug('hotsite-admin-tenant-layout')
          .build(),
      );

    await saveHotsiteConfig(ds, TENANT_A, false);
    await saveHotsiteConfig(ds, TENANT_B, false);
    await saveHotsiteConfig(ds, TENANT_LAYOUT, false);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /tenants/hotsite', () => {
    it('returns 403 when X-Actor-Role is not MANAGER', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'STAFF')
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns 404 when no hotsite config exists for the tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_NO_HOTSITE)
        .set('X-Actor-Role', 'MANAGER')
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns branding, layout, seo, and isPublished for the tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body.isPublished).toBe(false);
      expect(body.branding.primaryColor).toBe('#2563EB');
      expect(body.layout).toHaveLength(1);
      expect(body.layout[0].type).toBe('HERO');
      expect(body.seo).toEqual({ title: null, description: null, ogImageUrl: '' });
    });
  });

  describe('PATCH /tenants/hotsite', () => {
    it('returns 400 for an invalid hex color', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { primaryColor: 'not-a-color' } })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 when a BOOKING_CTA module carouselDays exceeds tenant.settings.booking.maxBookingAdvanceDays', async () => {
      // carouselDays is capped at 90 by the module schema itself, so the tenant rule is reachable
      // only for a tenant whose own limit is lower than that.
      const tenants = ds.getRepository(TenantEntity);
      const tenant = await tenants.findOneByOrFail({ id: TENANT_A });
      const defaultSettings = tenant.settings;
      await tenants.update(
        { id: TENANT_A },
        {
          settings: {
            ...defaultSettings,
            booking: { ...defaultSettings.booking, maxBookingAdvanceDays: 30 },
          },
        },
      );

      try {
        const { body } = await request(app.getHttpServer())
          .patch('/tenants/hotsite')
          .set('X-Tenant-ID', TENANT_A)
          .set('X-Actor-Role', 'MANAGER')
          .send({
            layout: [
              {
                type: 'BOOKING_CTA',
                enabled: true,
                data: { title: 'Agende já', ctaLabel: 'Agendar', carouselDays: 31 },
              },
            ],
          })
          .expect(400);

        expect(body.status).toBe(400);
        expect(body.code).toBe('PLATFORM_HOTSITE_CAROUSEL_DAYS_EXCEEDS_MAX_ADVANCE');
      } finally {
        await tenants.update({ id: TENANT_A }, { settings: defaultSettings });
      }
    });

    it('returns 400 with a field-level violation when carouselDays is beyond the module schema cap of 90', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          layout: [
            {
              type: 'BOOKING_CTA',
              enabled: true,
              data: { title: 'Agende já', ctaLabel: 'Agendar', carouselDays: 91 },
            },
          ],
        })
        .expect(400);

      expect(body.violations).toEqual([
        expect.objectContaining({
          field: 'layout.0.data.carouselDays',
          code: 'GENERIC_VALUE_OUT_OF_RANGE',
        }),
      ]);
    });

    // TD56-S01 — the section-presentation contract, on a tenant of its own so the layout it stores
    // does not leak into the assertions of the tests above and below.
    describe('TD56 layout contract (NAVIGATION, CONTENT_BLOCK, presentation)', () => {
      const hero = {
        type: 'HERO',
        enabled: true,
        data: { variant: 'immersive', title: 'T', ctaLabel: 'Go', ctaTarget: 'booking-form' },
        presentation: {
          minHeight: 'viewport',
          overlay: {
            type: 'linear-gradient',
            direction: 'to-top',
            fromColor: '#090909',
            fromOpacity: 0.88,
            toColor: '#090909',
            toOpacity: 0,
          },
        },
      };
      const about = {
        type: 'ABOUT',
        enabled: true,
        data: { title: 'Sobre', body: 'Texto', imagePosition: 'left', variant: 'editorial' },
        presentation: { surface: 'custom', customColor: '#0B0908', contentWidth: 'narrow' },
      };
      const navigation = {
        type: 'NAVIGATION',
        enabled: true,
        data: { items: [{ label: 'Sobre', target: 'about' }] },
      };
      const contentBlock = {
        type: 'CONTENT_BLOCK',
        enabled: true,
        data: {
          variant: 'trust-grid',
          title: 'Por que nós',
          items: [{ label: 'Rápido' }, { label: 'Seguro', description: 'Sem filas' }],
        },
        presentation: { padding: 'spacious' },
      };

      const patchLayout = (layout: unknown[], tenantId = TENANT_LAYOUT) =>
        request(app.getHttpServer())
          .patch('/tenants/hotsite')
          .set('X-Tenant-ID', tenantId)
          .set('X-Actor-Role', 'MANAGER')
          .send({ layout });

      it('persists and returns NAVIGATION, CONTENT_BLOCK and every presentation through a real row', async () => {
        const layout = [navigation, hero, about, contentBlock];

        const { body } = await patchLayout(layout).expect(200);
        expect(body.layout).toEqual(layout);

        const row = await ds
          .getRepository(HotsiteConfigEntity)
          .findOneByOrFail({ tenantId: TENANT_LAYOUT });
        expect(row.layout).toEqual(layout);

        const read = await request(app.getHttpServer())
          .get('/tenants/hotsite')
          .set('X-Tenant-ID', TENANT_LAYOUT)
          .set('X-Actor-Role', 'MANAGER')
          .expect(200);
        expect(read.body.layout).toEqual(layout);
      });

      it.each([
        ['NAVIGATION not first', [about, navigation], 'PLATFORM_HOTSITE_NAVIGATION_NOT_FIRST'],
        [
          'a navigation target that is not an enabled module',
          [navigation, hero],
          'PLATFORM_HOTSITE_NAVIGATION_TARGET_NOT_ENABLED',
        ],
        [
          'a module type twice',
          [about, { ...about, enabled: false }],
          'PLATFORM_HOTSITE_MODULE_DUPLICATE',
        ],
        [
          'presentation on FOOTER',
          [{ type: 'FOOTER', enabled: true, data: {}, presentation: { surface: 'primary' } }],
          'PLATFORM_HOTSITE_PRESENTATION_NOT_ALLOWED',
        ],
        [
          'presentation.background on HERO',
          [{ ...hero, presentation: { background: { imageUrl: null } } }],
          'PLATFORM_HOTSITE_PRESENTATION_BACKGROUND_NOT_ALLOWED',
        ],
      ])('rejects %s with its own code and persists nothing', async (_label, layout, code) => {
        const before = await ds
          .getRepository(HotsiteConfigEntity)
          .findOneByOrFail({ tenantId: TENANT_LAYOUT });

        const { body } = await patchLayout(layout).expect(400);

        expect(body.code).toBe(code);
        const after = await ds
          .getRepository(HotsiteConfigEntity)
          .findOneByOrFail({ tenantId: TENANT_LAYOUT });
        expect(after.layout).toEqual(before.layout);
      });

      it('rejects malformed module data with a field-level violation', async () => {
        const { body } = await patchLayout([
          { type: 'GALLERY', enabled: true, data: { images: [], layout: 'zzz', maxVisible: 6 } },
        ]).expect(400);

        expect(body.violations).toEqual([
          expect.objectContaining({ field: 'layout.0.data.layout', code: 'GENERIC_VALUE_INVALID' }),
        ]);
      });

      it('rejects a NAVIGATION whose data carries an unknown key', async () => {
        const { body } = await patchLayout([
          { type: 'NAVIGATION', enabled: true, data: { items: [], extra: true } },
        ]).expect(400);

        expect(body.violations).toHaveLength(1);
        expect(body.violations[0].code).toBe('GENERIC_VALUE_INVALID');
      });

      it('rejects a font outside the registry', async () => {
        await request(app.getHttpServer())
          .patch('/tenants/hotsite')
          .set('X-Tenant-ID', TENANT_LAYOUT)
          .set('X-Actor-Role', 'MANAGER')
          .send({ branding: { headingFontFamily: 'Comic Sans; color: red' } })
          .expect(400);
      });

      // Tenant isolation: another tenant's staging upload must never be promoted into this
      // tenant's section, whichever nested slot it is smuggled into.
      it.each([
        [
          'presentation.background.imageUrl',
          (path: string) => [
            {
              type: 'ABOUT',
              enabled: true,
              data: { title: 'T', body: 'B', imagePosition: 'left' },
              presentation: { background: { imageUrl: path } },
            },
          ],
        ],
        [
          'a collage-callout image',
          (path: string) => [
            {
              type: 'CONTENT_BLOCK',
              enabled: true,
              data: {
                variant: 'collage-callout',
                title: 'T',
                images: [{ url: path }, { url: path }],
              },
            },
          ],
        ],
      ])(
        "returns 400 PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED for another tenant's tmp/ path in %s",
        async (_label, buildLayout) => {
          const foreignPath = `tmp/${TENANT_A}/section-background/019f420c-0000-7000-8000-000000000001/bg.jpg`;
          storageService.markAsUploaded(foreignPath);
          const before = await ds
            .getRepository(HotsiteConfigEntity)
            .findOneByOrFail({ tenantId: TENANT_LAYOUT });

          const { body } = await patchLayout(buildLayout(foreignPath)).expect(400);

          expect(body.code).toBe('PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED');
          const after = await ds
            .getRepository(HotsiteConfigEntity)
            .findOneByOrFail({ tenantId: TENANT_LAYOUT });
          expect(after.layout).toEqual(before.layout);
          expect(await storageService.exists(foreignPath, 'private')).toBe(true);
        },
      );

      it("promotes the tenant's own nested tmp/ upload to a permanent path", async () => {
        const tmpPath = `tmp/${TENANT_LAYOUT}/section-background/019f420c-0000-7000-8000-000000000002/bg.jpg`;
        storageService.markAsUploaded(tmpPath);

        const { body } = await patchLayout([
          {
            type: 'ABOUT',
            enabled: true,
            data: { title: 'T', body: 'B', imagePosition: 'left' },
            presentation: { background: { imageUrl: tmpPath } },
          },
        ]).expect(200);

        expect(body.layout[0].presentation.background.imageUrl).toContain(
          `tenants/${TENANT_LAYOUT}/hotsite/section-background/019f420c-0000-7000-8000-000000000002/bg.jpg`,
        );
      });
    });

    it('returns 400 when the branding logoUrl has not been uploaded, then 200 after upload', async () => {
      const logoPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;

      const missing = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { logoUrl: logoPath } })
        .expect(400);
      expect(missing.body.status).toBe(400);

      storageService.markAsUploaded(logoPath);

      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { logoUrl: logoPath } })
        .expect(200);

      expect(body.branding.logoUrl).toBe(storageService.getPublicUrl(logoPath));
    });

    it('promotes a tmp/-referenced logoUrl to a permanent path and deletes the superseded logo', async () => {
      const previousLogoPath = `tenants/${TENANT_A}/hotsite/branding/u1/logo.png`;
      const tmpLogoPath = `tmp/${TENANT_A}/branding/u2/new-logo.png`;
      storageService.markAsUploaded(tmpLogoPath);

      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { logoUrl: tmpLogoPath } })
        .expect(200);

      const promotedPath = `tenants/${TENANT_A}/hotsite/branding/u2/new-logo.png`;
      expect(body.branding.logoUrl).toBe(storageService.getPublicUrl(promotedPath));

      const saved = await ds
        .getRepository(HotsiteConfigEntity)
        .findOne({ where: { tenantId: TENANT_A } });
      expect(saved!.branding.logoUrl).toBe(promotedPath);

      expect(storageService.copiedPaths).toEqual(
        expect.arrayContaining([
          { sourcePath: tmpLogoPath, destinationPath: promotedPath, destinationBucket: 'public' },
        ]),
      );
      expect(storageService.deletedPaths).toEqual(
        expect.arrayContaining([tmpLogoPath, previousLogoPath]),
      );
    });

    it('returns 400 for an invalid buttonBackgroundColor hex value', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { buttonBackgroundColor: 'notacolor' } })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('persists buttonBackgroundColor/buttonTextColor and round-trips via GET', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { buttonBackgroundColor: '#fbbf24', buttonTextColor: '#0f172a' } })
        .expect(200);

      expect(body.branding.buttonBackgroundColor).toBe('#FBBF24');
      expect(body.branding.buttonTextColor).toBe('#0F172A');

      const { body: getBody } = await request(app.getHttpServer())
        .get('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(getBody.branding.buttonBackgroundColor).toBe('#FBBF24');
      expect(getBody.branding.buttonTextColor).toBe('#0F172A');
    });

    it('merges and persists branding without affecting other tenants', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { primaryColor: '#FF5733' } })
        .expect(200);

      expect(body.branding.primaryColor).toBe('#FF5733');

      const savedA = await ds.getRepository(HotsiteConfigEntity).findOne({
        where: { tenantId: TENANT_A },
      });
      expect(savedA!.branding.primaryColor).toBe('#FF5733');

      const savedB = await ds.getRepository(HotsiteConfigEntity).findOne({
        where: { tenantId: TENANT_B },
      });
      expect(savedB!.branding.primaryColor).toBe('#2563EB');
    });

    it('persists seo title and description and round-trips via GET', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ seo: { title: 'Lavacar Estrela — Agendamento Online', description: 'Agende já.' } })
        .expect(200);

      expect(body.seo).toEqual({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende já.',
        ogImageUrl: '',
      });

      const { body: getBody } = await request(app.getHttpServer())
        .get('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(getBody.seo).toEqual({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende já.',
        ogImageUrl: '',
      });
    });

    it('returns 400 when seo.title exceeds 60 characters', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ seo: { title: 'a'.repeat(61) } })
        .expect(400);

      expect(body.status).toBe(400);
    });

    // M20-S08 — audienceMode/questions fold LeadFormConfig's own write into this consolidated
    // endpoint (previously a separate PATCH /tenants/lead-form/config; see
    // lead-form.controller.integration.spec.ts's own note on why that describe block moved here).
    it('saves the LEAD_FORM teaser (via layout[]) and audienceMode/questions atomically', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          layout: [
            {
              type: 'LEAD_FORM',
              enabled: true,
              data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
            },
          ],
          audienceMode: 'CUSTOMER_ONLY',
          questions: makeLeadFormQuestions(1),
        })
        .expect(200);

      const leadFormModule = body.layout.find((m: { type: string }) => m.type === 'LEAD_FORM');
      expect(leadFormModule.data.title).toBe('Fale com a gente');
      expect(leadFormModule.enabled).toBe(true);

      const savedLeadFormConfig = await ds
        .getRepository(LeadFormConfigEntity)
        .findOneBy({ tenantId: TENANT_A });
      expect(savedLeadFormConfig!.audienceMode).toBe('CUSTOMER_ONLY');
      expect(savedLeadFormConfig!.questions).toHaveLength(1);

      const { body: leadFormConfigBody } = await request(app.getHttpServer())
        .get('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);
      expect(leadFormConfigBody.title).toBe('Fale com a gente');
      expect(leadFormConfigBody.audienceMode).toBe('CUSTOMER_ONLY');
    });

    it('returns 400 PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED for 21 questions', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ questions: makeLeadFormQuestions(21) })
        .expect(400);

      expect(body.code).toBe('PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED');
    });

    it('does not touch LeadFormConfig when neither audienceMode nor questions is provided', async () => {
      await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_B)
        .set('X-Actor-Role', 'MANAGER')
        .send({ branding: { brandName: 'Acme' } })
        .expect(200);

      const savedLeadFormConfig = await ds
        .getRepository(LeadFormConfigEntity)
        .findOneBy({ tenantId: TENANT_B });
      expect(savedLeadFormConfig).toBeNull();
    });
  });

  describe('POST /tenants/hotsite/publish', () => {
    it('returns 404 when no hotsite config exists for the tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/publish')
        .set('X-Tenant-ID', TENANT_NO_HOTSITE)
        .set('X-Actor-Role', 'MANAGER')
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('publishes the hotsite for the tenant, triggers revalidation, and does not affect other tenants', async () => {
      frontendRevalidation.revalidatedSlugs.length = 0;

      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/publish')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body.isPublished).toBe(true);
      expect(frontendRevalidation.revalidatedSlugs).toEqual(['hotsite-admin-tenant-a']);

      const savedB = await ds.getRepository(HotsiteConfigEntity).findOne({
        where: { tenantId: TENANT_B },
      });
      expect(savedB!.isPublished).toBe(false);
    });
  });

  describe('POST /tenants/hotsite/unpublish', () => {
    it('unpublishes the hotsite for the tenant and triggers revalidation', async () => {
      frontendRevalidation.revalidatedSlugs.length = 0;

      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/unpublish')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body.isPublished).toBe(false);
      expect(frontendRevalidation.revalidatedSlugs).toEqual(['hotsite-admin-tenant-a']);
    });
  });

  describe('POST /tenants/hotsite/images/signed-url', () => {
    it('returns a tenant-scoped tmp/ staging filePath, signedUrl, and expiresAt', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/images/signed-url')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ fileName: 'logo.png', contentType: 'image/png', purpose: 'branding' })
        .expect(201);

      expect(body.filePath.startsWith(`tmp/${TENANT_A}/branding/`)).toBe(true);
      expect(body.signedUrl).toContain(body.filePath);
      expect(body.expiresAt).toBeDefined();
    });

    it('returns 400 for an invalid contentType', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/images/signed-url')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ fileName: 'logo.gif', contentType: 'image/gif', purpose: 'branding' })
        .expect(400);

      expect(body.status).toBe(400);
    });
  });

  describe('POST /tenants/hotsite/images/read-signed-url', () => {
    it('returns a signedUrl and expiresAt for a tenant-owned tmp/ path', async () => {
      const filePath = `tmp/${TENANT_A}/branding/u1/logo.png`;

      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/images/read-signed-url')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ filePath })
        .expect(201);

      expect(body.signedUrl).toContain(filePath);
      expect(body.expiresAt).toBeDefined();
    });

    it('returns 400 for a cross-tenant tmp/ path', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/images/read-signed-url')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ filePath: `tmp/${TENANT_B}/branding/u1/logo.png` })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 for a filePath outside the tmp/ shape', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/images/read-signed-url')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ filePath: `tenants/${TENANT_A}/hotsite/branding/u1/logo.png` })
        .expect(400);

      expect(body.status).toBe(400);
    });
  });

  describe('POST /tenants/hotsite/gallery/feature-booking-photo', () => {
    it('returns 403 when X-Actor-Role is not MANAGER', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/gallery/feature-booking-photo')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'STAFF')
        .send({ bookingId: BOOKING_ID, filePath: AFTER_PHOTO, photoType: 'after' })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('copies the booking photo into the public bucket and returns filePath, url, photoType', async () => {
      storageService.markAsUploaded(AFTER_PHOTO);

      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/gallery/feature-booking-photo')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ bookingId: BOOKING_ID, filePath: AFTER_PHOTO, photoType: 'after' })
        .expect(201);

      expect(body.photoType).toBe('after');
      expect(body.filePath.startsWith(`tenants/${TENANT_A}/hotsite/gallery/`)).toBe(true);
      expect(body.url).toBe(storageService.getPublicUrl(body.filePath));
      expect(storageService.copiedPaths).toContainEqual({
        sourcePath: AFTER_PHOTO,
        destinationPath: body.filePath,
        destinationBucket: 'public',
      });
    });

    it('returns 400 when the source photo does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/gallery/feature-booking-photo')
        .set('X-Tenant-ID', TENANT_B)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          bookingId: BOOKING_ID,
          filePath: `tenants/${TENANT_B}/bookings/${BOOKING_ID}/missing.jpg`,
          photoType: 'after',
        })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 when the photo path belongs to another tenant', async () => {
      storageService.markAsUploaded(OTHER_TENANT_PHOTO);
      const { body } = await request(app.getHttpServer())
        .post('/tenants/hotsite/gallery/feature-booking-photo')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          bookingId: BOOKING_ID,
          filePath: OTHER_TENANT_PHOTO,
          photoType: 'after',
        })
        .expect(400);

      expect(body.status).toBe(400);
    });
  });
});
