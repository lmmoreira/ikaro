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

  it('returns 400 when X-Tenant-ID header is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiry_days: 90 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 403 when X-Actor-Role is not MANAGER', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'STAFF')
      .send({ settings: { loyalty: { expiry_days: 90 } } })
      .expect(403);

    expect(body.status).toBe(403);
  });

  it('returns 400 for an invalid payload (cancellation_window_hours negative)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellation_window_hours: -1 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid slot_granularity_minutes value', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { slot_granularity_minutes: 45 } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists a partial loyalty update', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { loyalty: { expiry_days: 365 } } })
      .expect(200);

    expect(body.settings.loyalty.expiry_days).toBe(365);
    expect(body.settings.loyalty.enable_notifications).toBe(true);
    expect(body.settings.booking.cancellation_window_hours).toBe(48);

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.loyalty.expiry_days).toBe(365);
  });

  it('returns 200 and persists a partial booking update without wiping loyalty', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { booking: { cancellation_window_hours: 72 } } })
      .expect(200);

    expect(body.settings.booking.cancellation_window_hours).toBe(72);
    expect(body.settings.loyalty.expiry_days).toBe(365);
  });

  it('returns 200 and updates the tenant name', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ name: 'Lavacar Renomeado' })
      .expect(200);

    expect(body.name).toBe('Lavacar Renomeado');

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.name).toBe('Lavacar Renomeado');
  });

  it('returns 400 for an invalid IANA timezone from domain validation', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { business_hours: { timezone: 'Not/AZone' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists a business_info update with address', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          business_info: {
            phone: '+5511987654321',
            email: 'contato@beloauto.com.br',
            address: {
              street: 'Av. Paulista',
              number: '1000',
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
              zip_code: '01310100',
            },
          },
        },
      })
      .expect(200);

    expect(body.settings.business_info.phone).toBe('+5511987654321');
    expect(body.settings.business_info.address.zip_code).toBe('01310100');

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.business_info?.email).toBe('contato@beloauto.com.br');
  });

  it('returns 400 for an invalid business_info.address.zip_code', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          business_info: {
            address: {
              street: 'Av. Paulista',
              number: '1000',
              neighborhood: 'Bela Vista',
              city: 'São Paulo',
              state: 'SP',
              zip_code: '123',
            },
          },
        },
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid business_info.phone', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({ settings: { business_info: { phone: '123' } } })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 200 and persists social_links in business_info', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: {
          business_info: {
            social_links: {
              whatsapp: '+5511987654321',
              instagram: 'https://instagram.com/lavacar',
              facebook: 'https://facebook.com/lavacar',
            },
          },
        },
      })
      .expect(200);

    expect(body.settings.business_info.social_links).toEqual({
      whatsapp: '+5511987654321',
      instagram: 'https://instagram.com/lavacar',
      facebook: 'https://facebook.com/lavacar',
    });

    const row = await ds.getRepository(TenantEntity).findOne({ where: { id: tenantId } });
    expect(row!.settings.business_info?.social_links?.whatsapp).toBe('+5511987654321');
  });

  it('returns 400 for an invalid social_links.whatsapp (not a phone number)', async () => {
    const { body } = await request(app.getHttpServer())
      .patch('/tenants/settings')
      .set('X-Tenant-ID', tenantId)
      .set('X-Actor-Role', 'MANAGER')
      .send({
        settings: { business_info: { social_links: { whatsapp: '123' } } },
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
      .send({ settings: { loyalty: { expiry_days: 90 } } })
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain('inactive');
  });
});
