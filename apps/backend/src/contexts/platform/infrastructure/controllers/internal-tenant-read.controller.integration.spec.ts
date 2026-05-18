import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { PlatformModule } from '../../platform.module';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';

describe('InternalTenantReadController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = 'integ-read-key-integ-read-key-xx';

    const moduleRef = await Test.createTestingModule({
      imports: [
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
      .useValue(new InMemoryEventBus())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('returns 404 for an unknown tenant ID', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/tenants/00000000-0000-0000-0000-000000000000')
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
      .expect(200);

    expect(body.id).toBe('a1b2c3d4-0000-0000-0000-000000000001');
    expect(body.slug).toBe('read-integ-tenant-01');
    expect(body.name).toBe('BeloAuto');
  });
});
