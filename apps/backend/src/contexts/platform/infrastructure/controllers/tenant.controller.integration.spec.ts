import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { RequestInterceptor } from '../../../../shared/request/request.interceptor';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TenantEntityBuilder } from '../../../../test/builders/platform/index';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { PlatformModule } from '../../platform.module';

const TEST_KEY = 'rename-integ-test-key-tenant-xxxx'; // exactly 36 chars

describe('TenantController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [TenantEntity, HotsiteConfigEntity],
          synchronize: false,
        }),
        EventBusModule,
        TransactionManagerModule,
        PlatformModule,
      ],
      providers: [{ provide: APP_INTERCEPTOR, useClass: RequestInterceptor }],
    })
      .overrideProvider(EVENT_BUS)
      .useValue(new RoutingInMemoryEventBus())
      .overrideProvider(STORAGE_SERVICE)
      .useValue(new InMemoryStorageService())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ds = moduleRef.get(DataSource);

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Lavacar Rename Test',
        slug: 'lavacar-rename-integ-01',
        adminEmail: 'rename@test.com.br',
        country_code: 'BR',
      })
      .expect(201);

    tenantId = body.tenantId as string;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('returns 400 when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Novo Nome' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 when X-Actor-Role is not MANAGER', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .send({ name: 'Novo Nome' })
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 for an empty name', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: '' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and updates the tenant name', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Lavacar Renomeado' })
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
    expect(body.name).toBe('Lavacar Renomeado');

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.name).toBe('Lavacar Renomeado');
  });

  it('only renames the requesting tenant, not another tenant', async () => {
    const { body: otherBody } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Other Tenant Rename Test',
        slug: 'other-tenant-rename-integ-01',
        adminEmail: 'other-rename@test.com.br',
        country_code: 'BR',
      })
      .expect(201);
    const otherTenantId = otherBody.tenantId as string;

    await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Tenant Renamed Again' })
      .expect(200);

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: otherTenantId } });
    expect(row!.name).toBe('Other Tenant Rename Test');
  });

  it('returns 409 when the tenant is inactive', async () => {
    const inactiveTenant = new TenantEntityBuilder()
      .withId('00000000-0000-0000-0000-000000000002')
      .withSlug('lavacar-rename-inactive-integ-01')
      .withIsActive(false)
      .build();
    await ds.getRepository(TenantEntity).save(inactiveTenant);

    const { body } = await request(app.getHttpServer())
      .patch('/tenants')
      .set('X-Tenant-ID', inactiveTenant.id)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Novo Nome' })
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain('inactive');
  });
});
