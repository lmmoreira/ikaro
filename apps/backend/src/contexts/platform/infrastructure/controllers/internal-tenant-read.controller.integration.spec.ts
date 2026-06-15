import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

interface PublishedHotsiteItem {
  slug: string;
  updatedAt: string;
}

const INTERNAL_KEY = 'integ-read-key-integ-read-key-xx'; // exactly 32 chars

describe('InternalTenantReadController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    ({ app, ds } = await createPlatformIntegrationApp({
      extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
    }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 when X-Internal-Key header is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/00000000-0000-0000-0000-000000000000')
      .expect(401);

    expect(body.status).toBe(401);
    expect(body.type).toBe('about:blank');
  });

  it('returns 404 for an unknown tenant ID', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/00000000-0000-0000-0000-000000000000')
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(404);

    expect(body.status).toBe(404);
    expect(body.type).toBe('about:blank');
  });

  it('returns tenant info for a known tenant ID', async () => {
    const entity = new TenantEntityBuilder()
      .withId('a1b2c3d4-0000-0000-0000-000000000001')
      .withSlug('read-integ-tenant-01')
      .build();
    await ds.getRepository(TenantEntity).save(entity);

    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/a1b2c3d4-0000-0000-0000-000000000001')
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(200);

    expect(body.id).toBe('a1b2c3d4-0000-0000-0000-000000000001');
    expect(body.slug).toBe('read-integ-tenant-01');
    expect(body.name).toBe('BeloAuto');
  });

  it('returns tenant info for a known slug', async () => {
    const entity = new TenantEntityBuilder()
      .withId('a1b2c3d4-0000-0000-0000-000000000002')
      .withSlug('read-integ-tenant-02')
      .build();
    await ds.getRepository(TenantEntity).save(entity);

    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/by-slug/read-integ-tenant-02')
      .set('X-Internal-Key', INTERNAL_KEY)
      .expect(200);

    expect(body.id).toBe('a1b2c3d4-0000-0000-0000-000000000002');
    expect(body.slug).toBe('read-integ-tenant-02');
  });

  describe('GET /internal/tenants/published-hotsites', () => {
    it('includes an active tenant with a published hotsite', async () => {
      const tenant = new TenantEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-000000000010')
        .withSlug('read-integ-published-10')
        .build();
      await ds.getRepository(TenantEntity).save(tenant);
      const config = new HotsiteConfigEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-0000000000a0')
        .withTenantId(tenant.id)
        .withIsPublished(true)
        .build();
      await ds.getRepository(HotsiteConfigEntity).save(config);

      const { body } = await request(app.getHttpServer())
        .get('/internal/tenants/published-hotsites')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      const items = body.items as PublishedHotsiteItem[];
      const item = items.find((i) => i.slug === 'read-integ-published-10');
      expect(item).toBeDefined();
      expect(item?.updatedAt).toBe(config.updatedAt.toISOString());
    });

    it('excludes an active tenant whose hotsite is not published', async () => {
      const tenant = new TenantEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-000000000011')
        .withSlug('read-integ-unpublished-11')
        .build();
      await ds.getRepository(TenantEntity).save(tenant);
      const config = new HotsiteConfigEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-0000000000a1')
        .withTenantId(tenant.id)
        .withIsPublished(false)
        .build();
      await ds.getRepository(HotsiteConfigEntity).save(config);

      const { body } = await request(app.getHttpServer())
        .get('/internal/tenants/published-hotsites')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      const items = body.items as PublishedHotsiteItem[];
      expect(items.find((i) => i.slug === 'read-integ-unpublished-11')).toBeUndefined();
    });

    it('excludes an inactive tenant even when its hotsite is published', async () => {
      const tenant = new TenantEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-000000000012')
        .withSlug('read-integ-inactive-12')
        .withIsActive(false)
        .build();
      await ds.getRepository(TenantEntity).save(tenant);
      const config = new HotsiteConfigEntityBuilder()
        .withId('a1b2c3d4-0000-0000-0000-0000000000a2')
        .withTenantId(tenant.id)
        .withIsPublished(true)
        .build();
      await ds.getRepository(HotsiteConfigEntity).save(config);

      const { body } = await request(app.getHttpServer())
        .get('/internal/tenants/published-hotsites')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      const items = body.items as PublishedHotsiteItem[];
      expect(items.find((i) => i.slug === 'read-integ-inactive-12')).toBeUndefined();
    });
  });
});
