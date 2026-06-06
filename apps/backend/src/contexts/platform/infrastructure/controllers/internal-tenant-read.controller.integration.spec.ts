import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { TenantEntity } from '../entities/tenant.entity';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

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
});
