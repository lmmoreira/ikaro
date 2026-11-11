import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';

const PLATFORM_KEY = 'integ-test-key-integ-test-key-xx'; // exactly 32 chars
const INTERNAL_KEY = 'integ-tenant-key-integ-tenant-key'; // 33 chars (≥32)
const VALID_CPF = '529.982.247-25';
const REGISTRATION_ID = '0198f1c2-7a3b-7c4d-8e5f-0123456789ab';

describe('InternalTenantController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const eventBus = new InMemoryEventBus();

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createPlatformIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
      // The harness's own bus is private; sharing ours lets the spec read what was published.
      overrideProviders: [
        { provide: EVENT_BUS, useValue: eventBus },
        { provide: OUTBOX_PUBLISHER, useValue: eventBus },
      ],
    }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 when X-Internal-Key header is absent (global guard)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com', country_code: 'BR' })
      .expect(401);

    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
  });

  it('returns 401 when X-Platform-Admin-Key header is absent (PlatformAdminGuard — X-Internal-Key present)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com', country_code: 'BR' })
      .expect(401);

    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
  });

  it('returns 401 for a wrong X-Platform-Admin-Key (PlatformAdminGuard — X-Internal-Key present)', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', 'wrong-key-wrong-key-wrong-key')
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com', country_code: 'BR' })
      .expect(401);

    expect(body.status).toBe(401);
  });

  it('returns 401 when the correct platform key is sent through Authorization', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com', country_code: 'BR' })
      .expect(401);

    expect(body.status).toBe(401);
  });

  it('returns 400 for an invalid email', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({ name: 'Test', slug: 'valid-slug-01', adminEmail: 'not-an-email', country_code: 'BR' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid slug format', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Test',
        slug: 'Invalid Slug!',
        adminEmail: 'test@test.com',
        country_code: 'BR',
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid IANA timezone', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Test',
        slug: 'valid-slug-02',
        adminEmail: 'test@test.com',
        country_code: 'BR',
        timezone: 'Not/AZone',
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('provisions a tenant and creates DB rows on valid request', async () => {
    const slug = 'lavacar-integ-ctrl-01';

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Lavacar Integração',
        slug,
        adminEmail: 'admin@lavacar.com.br',
        country_code: 'BR',
        taxId: VALID_CPF,
      })
      .expect(201);

    expect(body.tenantId).toBeDefined();
    expect(body.slug).toBe(slug);
    expect(body.name).toBe('Lavacar Integração');

    const tenantRow = await ds.getRepository(TenantEntity).findOne({ where: { slug } });
    expect(tenantRow).not.toBeNull();

    const hotsiteRow = await ds
      .getRepository(HotsiteConfigEntity)
      .findOne({ where: { tenantId: body.tenantId } });
    expect(hotsiteRow).not.toBeNull();
    expect(hotsiteRow!.isPublished).toBe(false);
  });

  it('returns 409 for a duplicate slug', async () => {
    const slug = 'lavacar-integ-ctrl-dup-01';
    const payload = {
      name: 'Dup',
      slug,
      adminEmail: 'dup@dup.com',
      country_code: 'BR',
      taxId: VALID_CPF,
    };

    await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send(payload)
      .expect(201);

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send(payload)
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain(slug);
  });

  describe('billing inputs (UC-024 with UC-110/UC-137)', () => {
    const provision = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Internal-Key', INTERNAL_KEY)
        .set('X-Platform-Admin-Key', PLATFORM_KEY)
        .send({ name: 'Billing Hint', adminEmail: 'b@b.com.br', country_code: 'BR', ...body });

    function publishedData(tenantId: string): Record<string, unknown> {
      const events = eventBus.published.filter(
        (event) => event.eventName === 'TenantProvisioned' && event.tenantId === tenantId,
      );
      expect(events).toHaveLength(1);
      return (events[0] as TenantProvisioned).data;
    }

    it('an exempt tenant needs no tax id and publishes billingHint.exempt = true', async () => {
      const { body } = await provision({ slug: 'billing-hint-exempt', exempt: true }).expect(201);

      const data = publishedData(body.tenantId);
      expect(data['billingHint']).toEqual({ exempt: true });
      expect(data['countryCode']).toBe('BR');
    });

    it('publishes billingHint.features and registrationId when asked', async () => {
      const { body } = await provision({
        slug: 'billing-hint-features',
        taxId: VALID_CPF,
        registrationId: REGISTRATION_ID,
        features: ['HOTSITE', 'BOOKING'],
      }).expect(201);

      const data = publishedData(body.tenantId);
      expect(data['billingHint']).toEqual({
        exempt: false,
        features: ['HOTSITE', 'BOOKING'],
        registrationId: REGISTRATION_ID,
      });
      expect(JSON.stringify(data)).not.toContain('52998224725');
    });

    it('a legacy caller without the new fields still succeeds: countryCode and no billingHint', async () => {
      const { body } = await provision({ slug: 'billing-hint-legacy', taxId: VALID_CPF }).expect(
        201,
      );

      const data = publishedData(body.tenantId);
      expect(data['countryCode']).toBe('BR');
      expect(data).not.toHaveProperty('billingHint');
    });

    it('a non-exempt BR tenant without a tax id is 422 SIGNUP_TAX_ID_REQUIRED and nothing is created', async () => {
      const slug = 'billing-hint-no-tax';
      const { body } = await provision({ slug }).expect(422);

      expect(body.code).toBe('SIGNUP_TAX_ID_REQUIRED');
      expect(await ds.getRepository(TenantEntity).findOne({ where: { slug } })).toBeNull();
    });

    it('an invalid tax id is 422 SIGNUP_TAX_ID_INVALID and nothing is created', async () => {
      const slug = 'billing-hint-bad-tax';
      const { body } = await provision({ slug, taxId: '529.982.247-26' }).expect(422);

      expect(body.code).toBe('SIGNUP_TAX_ID_INVALID');
      expect(await ds.getRepository(TenantEntity).findOne({ where: { slug } })).toBeNull();
    });

    it('a non-exempt US tenant is not rejected up front', async () => {
      await provision({ slug: 'billing-hint-us', country_code: 'US' }).expect(201);
    });

    it.each([
      ['a malformed registrationId', { registrationId: 'not-a-uuid', taxId: VALID_CPF }],
      ['exempt together with a registrationId', { exempt: true, registrationId: REGISTRATION_ID }],
      ['an unknown feature key', { exempt: true, features: ['HOTSITE', 'TELEPORT'] }],
      ['a subset that breaks the dependency graph', { exempt: true, features: ['LOYALTY'] }],
    ])('refuses %s with 400 before the tenant exists', async (label, extra) => {
      const slug = `billing-hint-refused-${label.replaceAll(/[^a-z]+/g, '-')}`.slice(0, 60);
      await provision({ slug, ...extra }).expect(400);

      expect(await ds.getRepository(TenantEntity).findOne({ where: { slug } })).toBeNull();
    });
  });
});
