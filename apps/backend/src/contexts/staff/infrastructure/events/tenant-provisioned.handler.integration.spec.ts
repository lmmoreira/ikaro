import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SYSTEM_ACTOR_ID } from '../../../../shared/domain/system-actor';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus/event-bus.module';
import { OutboxModule } from '../../../../shared/infrastructure/outbox/outbox.module';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { testCacheModule } from '../../../../test/utils/test-cache-module';
import { HotsiteConfigEntity } from '../../../platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../../platform/platform.module';
import { StaffModule } from '../../staff.module';
import { StaffEntity } from '../entities/staff.entity';

const PLATFORM_KEY = 'story-test-key-story-test-key-xx';

describe('Story: POST /internal/tenants → event bus → staff MANAGER created (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;

    const routingBus = new RoutingInMemoryEventBus();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        testCacheModule(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [TenantEntity, HotsiteConfigEntity, StaffEntity],
          synchronize: false,
        }),
        EventBusModule,
        OutboxModule,
        TransactionManagerModule,
        PlatformModule,
        StaffModule,
      ],
    })
      .overrideProvider(EVENT_BUS)
      .useValue(routingBus)
      .overrideProvider(OUTBOX_PUBLISHER)
      .useValue(routingBus)
      .overrideProvider(STORAGE_SERVICE)
      .useValue(new InMemoryStorageService())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('provisions tenant and creates first MANAGER staff synchronously via event bus', async () => {
    const slug = `story-${Date.now()}`;
    const adminEmail = `admin-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({
        name: 'Lava Car Story',
        slug,
        adminEmail,
        country_code: 'BR',
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);

    expect(body.tenantId).toBeDefined();
    const tenantId: string = body.tenantId;

    // RoutingInMemoryEventBus delivers synchronously — staff is already in DB when 201 returns.
    const staff = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, email: adminEmail } });

    expect(staff).not.toBeNull();
    expect(staff!.role).toBe('MANAGER');
    expect(staff!.isActive).toBe(true);
    expect(staff!.googleOAuthId).toBeNull();
    expect(staff!.name).toBeNull();
    expect(staff!.invitedBy).toBe(SYSTEM_ACTOR_ID);
    expect(staff!.tenantId).toBe(tenantId);
  });

  it('tenant isolation: staff row is scoped to the provisioned tenant only', async () => {
    const slugA = `iso-a-${Date.now()}`;
    const slugB = `iso-b-${Date.now()}`;
    const emailA = `iso-a-${Date.now()}@lavacar.com.br`;
    const emailB = `iso-b-${Date.now()}@lavacar.com.br`;

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({
          name: 'Iso A',
          slug: slugA,
          adminEmail: emailA,
          country_code: 'BR',
          timezone: 'America/Sao_Paulo',
        }),
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({
          name: 'Iso B',
          slug: slugB,
          adminEmail: emailB,
          country_code: 'BR',
          timezone: 'America/Sao_Paulo',
        }),
    ]);

    const tenantAId: string = resA.body.tenantId;
    const tenantBId: string = resB.body.tenantId;

    // Both requests complete synchronously — staff rows are already in DB.
    const staffA = await ds.getRepository(StaffEntity).find({ where: { tenantId: tenantAId } });
    const staffB = await ds.getRepository(StaffEntity).find({ where: { tenantId: tenantBId } });

    expect(staffA).toHaveLength(1);
    expect(staffB).toHaveLength(1);
    expect(staffA[0].tenantId).toBe(tenantAId);
    expect(staffB[0].tenantId).toBe(tenantBId);
  });
});
