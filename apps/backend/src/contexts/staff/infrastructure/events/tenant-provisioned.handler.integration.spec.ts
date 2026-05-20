import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SYSTEM_ACTOR_ID } from '../../../../shared/domain/system-actor';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { HotsiteConfigEntity } from '../../../platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import { PlatformModule } from '../../../platform/platform.module';
import { StaffEntity } from '../entities/staff.entity';
import { StaffModule } from '../../staff.module';
import { waitFor } from '../../../../test/utils/wait-for';

const PLATFORM_KEY = 'story-test-key-story-test-key-xx';

describe('Story: POST /internal/tenants → Pub/Sub → staff MANAGER created (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = PLATFORM_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [TenantEntity, HotsiteConfigEntity, StaffEntity],
          synchronize: false,
        }),
        EventBusModule,
        TransactionManagerModule,
        PlatformModule,
        StaffModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  it('provisions tenant, publishes TenantProvisioned, and creates first MANAGER staff via Pub/Sub', async () => {
    const slug = `story-${Date.now()}`;
    const adminEmail = `admin-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({
        name: 'Lava Car Story',
        slug,
        adminEmail,
        timezone: 'America/Sao_Paulo',
      })
      .expect(201);

    expect(body.tenantId).toBeDefined();
    const tenantId: string = body.tenantId;

    await waitFor(async () => {
      const row = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, email: adminEmail } });
      return row !== null;
    });

    const staff = await ds
      .getRepository(StaffEntity)
      .findOne({ where: { tenantId, email: adminEmail } });

    expect(staff).not.toBeNull();
    expect(staff!.role).toBe('MANAGER');
    expect(staff!.isActive).toBe(false);
    expect(staff!.googleOAuthId).toBeNull();
    expect(staff!.name).toBeNull();
    expect(staff!.invitedBy).toBe(SYSTEM_ACTOR_ID);
    expect(staff!.tenantId).toBe(tenantId);
  });

  it('is idempotent: redelivering the same TenantProvisioned event creates exactly one staff row', async () => {
    const slug = `story-idem-${Date.now()}`;
    const adminEmail = `admin-idem-${Date.now()}@lavacar.com.br`;

    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${PLATFORM_KEY}`)
      .send({ name: 'Idem Tenant', slug, adminEmail })
      .expect(201);

    const tenantId: string = body.tenantId;

    await waitFor(async () => {
      const row = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId, email: adminEmail } });
      return row !== null;
    });

    const rows = await ds.getRepository(StaffEntity).find({ where: { tenantId } });
    expect(rows).toHaveLength(1);
  });

  it('tenant isolation: staff row is scoped to the provisioned tenant only', async () => {
    const slugA = `iso-a-${Date.now()}`;
    const slugB = `iso-b-${Date.now()}`;
    const email = `iso-${Date.now()}@lavacar.com.br`;

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({ name: 'Iso A', slug: slugA, adminEmail: email }),
      request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${PLATFORM_KEY}`)
        .send({ name: 'Iso B', slug: slugB, adminEmail: `b-${email}` }),
    ]);

    const tenantAId: string = resA.body.tenantId;
    const tenantBId: string = resB.body.tenantId;

    await waitFor(async () => {
      const [a, b] = await Promise.all([
        ds.getRepository(StaffEntity).findOne({ where: { tenantId: tenantAId } }),
        ds.getRepository(StaffEntity).findOne({ where: { tenantId: tenantBId } }),
      ]);
      return a !== null && b !== null;
    });

    const staffA = await ds.getRepository(StaffEntity).find({ where: { tenantId: tenantAId } });
    const staffB = await ds.getRepository(StaffEntity).find({ where: { tenantId: tenantBId } });

    expect(staffA).toHaveLength(1);
    expect(staffB).toHaveLength(1);
    expect(staffA[0].tenantId).toBe(tenantAId);
    expect(staffB[0].tenantId).toBe(tenantBId);
  });
});
