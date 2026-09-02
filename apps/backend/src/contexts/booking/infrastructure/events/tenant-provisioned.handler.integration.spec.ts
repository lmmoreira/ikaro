import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PlatformModule } from '../../../platform/platform.module';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceType } from '../../domain/resource.types';

const PLATFORM_KEY = 'story-test-key-story-test-key-xx';

describe('Story: POST /internal/tenants → event bus → booking LOCATION resource created (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('provisions a pt-BR tenant and creates its "Localização Principal" LOCATION resource synchronously via event bus', async () => {
    const slug = `story-loc-br-${Date.now()}`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Lava Car Story',
        slug,
        adminEmail: `admin-${Date.now()}@lavacar.com.br`,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);

    const tenantId: string = body.tenantId;

    // RoutingInMemoryEventBus delivers synchronously — the resource is already in DB when 201 returns.
    const resources = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId, type: ResourceType.LOCATION } });

    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('Localização Principal');
    expect(resources[0].isActive).toBe(true);
    expect(resources[0].refId).toBeNull();
    expect(resources[0].tenantId).toBe(tenantId);
  });

  it('provisions an en tenant and creates its "Main Location" LOCATION resource', async () => {
    const slug = `story-loc-en-${Date.now()}`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', PLATFORM_KEY)
      .send({
        name: 'Ikaro Demo Story',
        slug,
        adminEmail: `admin-en-${Date.now()}@ikaro.com`,
        country_code: 'US',
        timezone: 'America/New_York',
      })
      .expect(201);

    const tenantId: string = body.tenantId;

    const resources = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId, type: ResourceType.LOCATION } });

    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe('Main Location');
  });

  it('tenant isolation: LOCATION resource is scoped to the provisioned tenant only', async () => {
    const slugA = `story-loc-iso-a-${Date.now()}`;
    const slugB = `story-loc-iso-b-${Date.now()}`;

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', PLATFORM_KEY)
        .send({
          name: 'Iso Loc A',
          slug: slugA,
          adminEmail: `iso-loc-a-${Date.now()}@lavacar.com.br`,
          country_code: 'BR',
          timezone: 'America/Sao_Paulo',
        }),
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', PLATFORM_KEY)
        .send({
          name: 'Iso Loc B',
          slug: slugB,
          adminEmail: `iso-loc-b-${Date.now()}@lavacar.com.br`,
          country_code: 'BR',
          timezone: 'America/Sao_Paulo',
        }),
    ]);

    const tenantAId: string = resA.body.tenantId;
    const tenantBId: string = resB.body.tenantId;

    const resourcesA = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: tenantAId, type: ResourceType.LOCATION } });
    const resourcesB = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: tenantBId, type: ResourceType.LOCATION } });

    expect(resourcesA).toHaveLength(1);
    expect(resourcesB).toHaveLength(1);
    expect(resourcesA[0].tenantId).toBe(tenantAId);
    expect(resourcesB[0].tenantId).toBe(tenantBId);
  });
});
