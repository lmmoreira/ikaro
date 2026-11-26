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
import { TENANT_ACCESS_PORT } from '../../../../shared/ports/tenant-access.port';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { addDaysUTC, todayInTimezone } from '../../../../shared/utils/calendar-date';

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
    expect(body.booking).toEqual({ maxBookingAdvanceDays: 90 });
  });

  it('returns the manifest for a published hotsite', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_A)
      .expect(200);

    expect(body.isPublished).toBe(true);
    expect(body.branding.primaryColor).toBe('#2563EB');
    expect(body.layout).toHaveLength(1);
    expect(body.layout[0].type).toBe('HERO');
    expect(body.booking).toEqual({ maxBookingAdvanceDays: 90 });
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

    expect(body.branding.buttonBackgroundColor).toBe('#FBBF24');
    expect(body.branding.buttonTextColor).toBe('#0F172A');
  });

  // M26-S18b — the public pickers read `booking.maxBookingAdvanceDays`, so a pending BOOKING
  // removal (the billing `bookableUntil` cap) stops them at its effective date.
  describe('the billing bookable-until cap (M26-S18b)', () => {
    // The default test tenant's calendar; the cap is counted from the tenant-local today.
    const TZ = 'America/Sao_Paulo';
    let access: InMemoryTenantAccessPort;

    const setCap = (tenantId: string, bookableUntil: string | null) =>
      access.seed(tenantId, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'BOOKING', tier: 'STANDARD' }],
        bookableUntil,
      });
    const capInDays = (days: number) => addDaysUTC(todayInTimezone(TZ), days);

    const manifestOf = async (tenantId: string) => {
      const { body } = await request(app.getHttpServer())
        .get('/hotsite')
        .set('X-Internal-Key', INTERNAL_KEY)
        .set('X-Tenant-ID', tenantId)
        .expect(200);
      return body;
    };

    beforeAll(() => {
      access = app.get<InMemoryTenantAccessPort>(TENANT_ACCESS_PORT);
    });

    // Suites share one app: a cap seeded here must never leak into another test.
    afterEach(() => {
      access.reactivate(TENANT_A);
      access.reactivate(TENANT_B);
    });

    it('clamps a published manifest to the whole days until the cap', async () => {
      setCap(TENANT_A, capInDays(30));

      expect((await manifestOf(TENANT_A)).booking).toEqual({ maxBookingAdvanceDays: 30 });
    });

    it('clamps an unpublished manifest the same way', async () => {
      setCap(TENANT_B, capInDays(12));

      const body = await manifestOf(TENANT_B);

      expect(body.isPublished).toBe(false);
      expect(body.booking).toEqual({ maxBookingAdvanceDays: 12 });
    });

    it('never raises the configured maximum when the cap is further away', async () => {
      setCap(TENANT_A, capInDays(200));

      expect((await manifestOf(TENANT_A)).booking).toEqual({ maxBookingAdvanceDays: 90 });
    });

    it('offers no day when the cap is today', async () => {
      setCap(TENANT_A, capInDays(0));

      expect((await manifestOf(TENANT_A)).booking).toEqual({ maxBookingAdvanceDays: 0 });
    });

    it('leaves the configured maximum alone for a null cap', async () => {
      setCap(TENANT_A, null);

      expect((await manifestOf(TENANT_A)).booking).toEqual({ maxBookingAdvanceDays: 90 });
    });

    it("tenant isolation: another tenant's cap never clamps the manifest", async () => {
      setCap(TENANT_B, capInDays(5));

      expect((await manifestOf(TENANT_A)).booking).toEqual({ maxBookingAdvanceDays: 90 });
    });
  });
});
