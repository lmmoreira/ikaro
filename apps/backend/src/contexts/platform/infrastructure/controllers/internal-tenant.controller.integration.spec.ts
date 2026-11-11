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
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';

const PLATFORM_KEY = 'integ-test-key-integ-test-key-xx'; // exactly 32 chars
const INTERNAL_KEY = 'integ-tenant-key-integ-tenant-key'; // 33 chars (≥32)

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
        registrationId: TEST_REGISTRATION_ID,
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
      registrationId: TEST_REGISTRATION_ID,
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

  describe('registration reference (UC-024, UC-110)', () => {
    const provision = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Internal-Key', INTERNAL_KEY)
        .set('X-Platform-Admin-Key', PLATFORM_KEY)
        .send({ name: 'Registered', adminEmail: 'b@b.com.br', country_code: 'BR', ...body });

    function publishedData(tenantId: string): Record<string, unknown> {
      const events = eventBus.published.filter(
        (event) => event.eventName === 'TenantProvisioned' && event.tenantId === tenantId,
      );
      expect(events).toHaveLength(1);
      return (events[0] as TenantProvisioned).data;
    }

    it('publishes TenantProvisioned with countryCode and the registrationId, and nothing billing-related', async () => {
      const { body } = await provision({
        slug: 'registered-tenant',
        registrationId: TEST_REGISTRATION_ID,
      }).expect(201);

      const data = publishedData(body.tenantId);
      expect(data['registrationId']).toBe(TEST_REGISTRATION_ID);
      expect(data['countryCode']).toBe('BR');
      for (const key of ['taxId', 'exempt', 'features', 'billingHint']) {
        expect(data).not.toHaveProperty(key);
      }
    });

    it('a US tenant is provisioned and publishes its country (no price or tax id check here)', async () => {
      const { body } = await provision({
        slug: 'registered-us',
        country_code: 'US',
        registrationId: TEST_REGISTRATION_ID,
      }).expect(201);

      expect(publishedData(body.tenantId)['countryCode']).toBe('US');
    });

    it('does not read Billing: an id no registration has is still accepted by this route', async () => {
      await provision({
        slug: 'registered-unknown',
        registrationId: '00000000-0000-4000-8000-0000000000ff',
      }).expect(201);
    });

    it.each([
      ['a missing registrationId', {}],
      ['a registrationId that is not a UUID', { registrationId: 'not-a-uuid' }],
    ])('refuses %s with 400 and creates no tenant', async (_label, extra) => {
      const slug = `registered-refused-${Math.random().toString(36).slice(2, 8)}`;
      const eventsBefore = eventBus.published.length;

      await provision({ slug, ...extra }).expect(400);

      expect(await ds.getRepository(TenantEntity).findOne({ where: { slug } })).toBeNull();
      expect(eventBus.published).toHaveLength(eventsBefore);
    });
  });
});
