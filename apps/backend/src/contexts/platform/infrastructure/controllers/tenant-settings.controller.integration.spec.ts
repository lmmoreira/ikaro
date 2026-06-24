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

const TEST_KEY = 'settings-integ-test-key-settings-xx'; // exactly 36 chars

describe('TenantSettingsController (integration)', () => {
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
        name: 'Lavacar Settings Test',
        slug: 'lavacar-settings-integ-01',
        adminEmail: 'settings@test.com.br',
        country_code: 'BR',
      })
      .expect(201);

    tenantId = body.tenantId as string;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('returns 200 with the tenant settings on GET', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
    expect(body.slug).toBe('lavacar-settings-integ-01');
    expect(body.name).toBe('Lavacar Settings Test');
    expect(body.settings.loyalty).toBeDefined();
    expect(body.settings.booking).toBeDefined();
  });

  it('returns 403 on GET when X-Actor-Role is not MANAGER', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 on GET when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Actor-Role', 'MANAGER')
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 on GET when X-Actor-Role is absent entirely (no separate 401 path on ManagerRoleGuard)', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('GET only returns the requesting tenant settings, not another tenant', async () => {
    const { body: otherBody } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Other Tenant Settings Test',
        slug: 'other-tenant-settings-integ-01',
        adminEmail: 'other-settings@test.com.br',
        country_code: 'BR',
      })
      .expect(201);
    const otherTenantId = otherBody.tenantId as string;

    await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', otherTenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 30 } } })
      .expect(200);

    const { body } = await request(app.getHttpServer())
      .get('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .expect(200);

    expect(body.tenantId).toBe(tenantId);
    expect(body.settings.loyalty.expiryDays).not.toBe(30);
  });

  it('returns 400 when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 when X-Actor-Role is not MANAGER', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 for an invalid payload (cancellationWindowHours negative)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellationWindowHours: -1 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid slotGranularityMinutes value', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { slotGranularityMinutes: 45 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists a partial loyalty update', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 365 } } })
      .expect(200);

    expect(body.settings.loyalty.expiryDays).toBe(365);
    expect(body.settings.loyalty.enableNotifications).toBe(true);
    expect(body.settings.booking.cancellationWindowHours).toBe(48);

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.loyalty.expiryDays).toBe(365);
  });

  it('returns 200 and persists a partial booking update without wiping loyalty', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellationWindowHours: 72 } } })
      .expect(200);

    expect(body.settings.booking.cancellationWindowHours).toBe(72);
    expect(body.settings.loyalty.expiryDays).toBe(365);
  });

  it('returns 400 when the body has no settings field (name moved to PATCH /tenants)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Lavacar Renomeado' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an empty settings object (no-op update)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: {} })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an unknown key inside settings', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { not_a_real_category: { foo: 'bar' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid IANA timezone from domain validation', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { businessHours: { timezone: 'Not/AZone' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists a businessInfo update with address', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
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
          },
        },
      })
      .expect(200);

    expect(body.settings.businessInfo.phone).toBe('+5511987654321');
    expect(body.settings.businessInfo.address.zipCode).toBe('01310100');

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.businessInfo?.email).toBe('contato@beloauto.com.br');
  });

  it('returns 400 for an invalid businessInfo.address.zipCode', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
            address: {
              street: 'Av. Paulista',
              number: '1000',
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '123',
            },
          },
        },
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid businessInfo.phone', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { businessInfo: { phone: '123' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists socialLinks in businessInfo', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          businessInfo: {
            socialLinks: {
              whatsapp: '+5511987654321',
              instagram: 'https://instagram.com/lavacar',
              facebook: 'https://facebook.com/lavacar',
            },
          },
        },
      })
      .expect(200);

    expect(body.settings.businessInfo.socialLinks).toEqual({
      whatsapp: '+5511987654321',
      instagram: 'https://instagram.com/lavacar',
      facebook: 'https://facebook.com/lavacar',
    });

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.businessInfo?.socialLinks?.whatsapp).toBe('+5511987654321');
  });

  it('returns 400 for an invalid socialLinks.whatsapp (not a phone number)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: { businessInfo: { socialLinks: { whatsapp: '123' } } },
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 409 when the tenant is inactive', async () => {
    const inactiveTenant = new TenantEntityBuilder()
      .withId('00000000-0000-0000-0000-000000000001')
      .withSlug('lavacar-inactive-integ-01')
      .withIsActive(false)
      .build();
    await ds.getRepository(TenantEntity).save(inactiveTenant);

    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', inactiveTenant.id)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiryDays: 90 } } })
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain('inactive');
  });
});
