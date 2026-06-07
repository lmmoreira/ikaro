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

const TENANT_A = 'b1c2d3e4-0000-0000-0000-000000000001';
const TENANT_B = 'b1c2d3e4-0000-0000-0000-000000000002';
const TENANT_NO_HOTSITE = 'b1c2d3e4-0000-0000-0000-000000000003';
const INTERNAL_KEY = 'integ-hotsite-key-hotsite-key-xx'; // exactly 32 chars

async function saveHotsiteConfig(
  ds: DataSource,
  tenantId: string,
  published: boolean,
): Promise<void> {
  const entity = new HotsiteConfigEntityBuilder()
    .withId(`c${tenantId.slice(1)}`)
    .withTenantId(tenantId)
    .withIsPublished(published)
    .build();

  await ds.getRepository(HotsiteConfigEntity).save(entity);
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

    await saveHotsiteConfig(ds, TENANT_A, true);
    await saveHotsiteConfig(ds, TENANT_B, false);
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

  it('returns 404 when the hotsite is not published', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_B)
      .expect(404);

    expect(body.status).toBe(404);
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

  it('tenant isolation: tenant B caller never receives tenant A published data', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/hotsite')
      .set('X-Internal-Key', INTERNAL_KEY)
      .set('X-Tenant-ID', TENANT_B)
      .expect(404);

    expect(body.status).toBe(404);
    expect(body.detail).not.toContain(TENANT_A);
  });
});
