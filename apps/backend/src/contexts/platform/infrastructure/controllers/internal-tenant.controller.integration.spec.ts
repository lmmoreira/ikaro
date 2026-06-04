import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { PlatformModule } from '../../platform.module';

const TEST_KEY = 'integ-test-key-integ-test-key-xx'; // exactly 32 chars
const AUTH = `Bearer ${TEST_KEY}`;

describe('InternalTenantController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

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
    })
      .overrideProvider(EVENT_BUS)
      .useValue(new RoutingInMemoryEventBus())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('returns 401 when Authorization header is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com' })
      .expect(401);

    expect(body.type).toBe('about:blank');
    expect(body.status).toBe(401);
  });

  it('returns 401 for a wrong API key', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', 'Bearer wrong-key-wrong-key-wrong-key')
      .send({ name: 'Test', slug: 'test', adminEmail: 'test@test.com' })
      .expect(401);

    expect(body.status).toBe(401);
  });

  it('returns 400 for an invalid email', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send({ name: 'Test', slug: 'valid-slug-01', adminEmail: 'not-an-email' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid slug format', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send({ name: 'Test', slug: 'Invalid Slug!', adminEmail: 'test@test.com' })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for an invalid IANA timezone', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send({
        name: 'Test',
        slug: 'valid-slug-02',
        adminEmail: 'test@test.com',
        timezone: 'Not/AZone',
      })
      .expect(400);

    expect(body.status).toBe(400);
  });

  it('provisions a tenant and creates DB rows on valid request', async () => {
    const slug = 'lavacar-integ-ctrl-01';

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send({ name: 'Lavacar Integração', slug, adminEmail: 'admin@lavacar.com.br' })
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
    const payload = { name: 'Dup', slug, adminEmail: 'dup@dup.com' };

    await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send(payload)
      .expect(201);

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', AUTH)
      .send(payload)
      .expect(409);

    expect(body.status).toBe(409);
    expect(body.detail).toContain(slug);
  });
});
