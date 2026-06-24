import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
  TenantSettingsPropsBuilder,
} from '../../../../test/builders/platform';
import { HotsiteBranding } from '../../domain/hotsite-config.aggregate';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

const TENANT_A = 'b1c2d3e4-0000-0000-0000-000000000001';
const TENANT_B = 'b1c2d3e4-0000-0000-0000-000000000002';
const TENANT_NO_HOTSITE = 'b1c2d3e4-0000-0000-0000-000000000003';
const TENANT_BUTTON_BRANDING = 'b1c2d3e4-0000-0000-0000-000000000004';
const TENANT_BUSINESS_INFO = 'b1c2d3e4-0000-0000-0000-000000000005';
const TENANT_SOCIAL_LINKS = 'b1c2d3e4-0000-0000-0000-000000000006';
const INTERNAL_KEY = 'integ-hotsite-key-hotsite-key-xx'; // exactly 32 chars

async function saveHotsiteConfig(
  ds: DataSource,
  tenantId: string,
  published: boolean,
  branding?: Partial<HotsiteBranding>,
): Promise<void> {
  const builder = new HotsiteConfigEntityBuilder()
    .withId(`c${tenantId.slice(1)}`)
    .withTenantId(tenantId)
    .withIsPublished(published);

  if (branding) {
    builder.withBranding(branding);
  }

  await ds.getRepository(HotsiteConfigEntity).save(builder.build());
}

describe('HotsiteController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createPlatformIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));

    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_A).withSlug('hotsite-integ-tenant-a').build());
    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_B).withSlug('hotsite-integ-tenant-b').build());
    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_NO_HOTSITE)
          .withSlug('hotsite-integ-tenant-c')
          .build(),
      );
    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_BUTTON_BRANDING)
          .withSlug('hotsite-integ-tenant-d')
          .build(),
      );
    await ds.getRepository(TenantEntity).save(
      new TenantEntityBuilder()
        .withId(TENANT_BUSINESS_INFO)
        .withSlug('hotsite-integ-tenant-e')
        .withSettings(
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
            .build(),
        )
        .build(),
    );
    await ds.getRepository(TenantEntity).save(
      new TenantEntityBuilder()
        .withId(TENANT_SOCIAL_LINKS)
        .withSlug('hotsite-integ-tenant-f')
        .withSettings(
          new TenantSettingsPropsBuilder()
            .withBusinessInfo({ phone: '+5511987654321' })
            .withSocialLinks({
              whatsapp: '+5511987654321',
              instagram: 'https://instagram.com/lavacar',
              facebook: null,
            })
            .build(),
        )
        .build(),
    );

    await saveHotsiteConfig(ds, TENANT_A, true);
    await saveHotsiteConfig(ds, TENANT_B, false);
    await saveHotsiteConfig(ds, TENANT_BUTTON_BRANDING, true, {
      buttonBackgroundColor: '#fbbf24',
      buttonTextColor: '#0f172a',
    });
    await saveHotsiteConfig(ds, TENANT_BUSINESS_INFO, true);
    await saveHotsiteConfig(ds, TENANT_SOCIAL_LINKS, true);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 when X-Internal-Key header is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Tenant-ID', TENANT_A)
      .expect(401);

    expect(body.status).toBe(401);
  });

  it('returns 400 when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 404 when no hotsite config exists for the tenant', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_NO_HOTSITE)
      .expect(404);

    expect(body.status).toBe(404);
  });

  it('returns 200 with isPublished: false, empty layout, and null business for an unpublished hotsite', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_B)
      .expect(200);

    expect(body.isPublished).toBe(false);
    expect(body.layout).toEqual([]);
    expect(body.business).toEqual({ phone: null, email: null, address: null, socialLinks: null });
  });

  it('returns the manifest for a published hotsite', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_A)
      .expect(200);

    expect(body.isPublished).toBe(true);
    expect(body.branding.primaryColor).toBe('#2563eb');
    expect(body.layout).toHaveLength(1);
    expect(body.layout[0].type).toBe('HERO');
  });

  it('returns null business fields when tenant.settings.businessInfo is unset', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_A)
      .expect(200);

    expect(body.business).toEqual({ phone: null, email: null, address: null, socialLinks: null });
  });

  it('returns business resolved from tenant.settings.businessInfo when set', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_BUSINESS_INFO)
      .expect(200);

    expect(body.business).toEqual({
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
      socialLinks: null,
    });
  });

  it('returns socialLinks from tenant.settings.businessInfo.socialLinks when set', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_SOCIAL_LINKS)
      .expect(200);

    expect(body.business.socialLinks).toEqual({
      whatsapp: '+5511987654321',
      instagram: 'https://instagram.com/lavacar',
      facebook: null,
    });
  });

  it('returns buttonBackgroundColor/buttonTextColor in the manifest branding when set', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_BUTTON_BRANDING)
      .expect(200);

    expect(body.branding.buttonBackgroundColor).toBe('#fbbf24');
    expect(body.branding.buttonTextColor).toBe('#0f172a');
  });
});
