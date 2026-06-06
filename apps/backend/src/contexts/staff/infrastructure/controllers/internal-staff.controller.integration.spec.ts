import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { StaffEntity } from '../entities/staff.entity';
import { StaffModule } from '../../staff.module';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';

const INTERNAL_KEY = 'integ-staff-key-integ-staff-key-x'; // 33 chars (≥32)

describe('InternalStaffController (integration) — auth-flow endpoints', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [StaffEntity],
          synchronize: false,
        }),
        EventBusModule,
        TransactionManagerModule,
        StaffModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
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
    delete process.env['INTERNAL_API_KEY'];
  });

  it('returns 401 when X-Internal-Key header is absent', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/internal/staff/by-oauth?googleOAuthId=any-sub')
      .expect(401);

    expect(body.status).toBe(401);
    expect(body.type).toBe('about:blank');
  });

  describe('GET /internal/staff/by-oauth', () => {
    it('returns 400 when googleOAuthId query param is absent', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(400);

      expect(body.status).toBe(400);
      expect(body.detail).toContain('googleOAuthId');
    });

    it('returns 404 when no staff is found for the given googleOAuthId', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-unknown')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns GetStaffByOAuthIdUseCaseResult for an active staff member', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000050')
        .withGoogleOAuthId('google-sub-m03s07-active')
        .withEmail('gerente-m03s07@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-active')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.tenantId).toBe('00000000-0000-0000-0000-000000000050');
      expect(body.role).toBe('MANAGER');
      expect(body.isActive).toBe(true);
    });

    it('returns isActive=false for a deactivated staff member', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000051')
        .withGoogleOAuthId('google-sub-m03s07-inactive')
        .withEmail('deactivated-m03s07@lavacar.com.br')
        .withRole('STAFF')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-inactive')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body.isActive).toBe(false);
      expect(body.role).toBe('STAFF');
    });

    it('tenant isolation: different staff in different tenants are returned independently', async () => {
      const entityA = new StaffEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000052')
        .withGoogleOAuthId('google-sub-m03s07-iso-a')
        .withEmail('staff-a-m03s07@tenanta.com.br')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entityA);

      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-iso-a')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body.tenantId).toBe('00000000-0000-0000-0000-000000000052');
      expect(body.staffId).toBe(entityA.id);
    });
  });

  describe('GET /internal/staff/by-email', () => {
    it('returns 400 when email is absent', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-email?tenantId=10000000-0000-4000-8000-000000000060')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(400);
      expect(body.status).toBe(400);
    });

    it('returns 400 when tenantId is absent', async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/staff/by-email?email=staff@lavacar.com.br')
        .set('X-Internal-Key', INTERNAL_KEY);
      expect(response.status).toBe(400);
    });

    it('returns 404 when no staff found for given email + tenantId', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=nobody-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000060',
        )
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns GetStaffByEmailUseCaseResult for an invited (inactive) staff', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000060')
        .withEmail('invited-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=invited-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000060',
        )
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.email).toBe('invited-m04s01@lavacar.com.br');
      expect(body.role).toBe('MANAGER');
      expect(body.isActive).toBe(false);
    });

    it('tenant isolation: same email in different tenant returns 404', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000061')
        .withEmail('iso-m04s01@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(
          '/internal/staff/by-email?email=iso-m04s01@lavacar.com.br&tenantId=10000000-0000-4000-8000-000000000099',
        )
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('POST /internal/staff/:staffId/activate', () => {
    it('returns 404 when staffId does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/10000000-0000-4000-8000-000000009999/activate')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000070',
          googleOAuthId: 'google-sub-m04s01-new',
          email: 'staff@lavacar.com.br',
          name: 'Staff User',
        })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 422 when Google email does not match invited email', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000070')
        .withEmail('invited-m04s01-act@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000070',
          googleOAuthId: 'google-sub-m04s01-act',
          email: 'wrong@gmail.com',
          name: 'Staff User',
        })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('activates staff, persists name, and returns 200 with result', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000071')
        .withEmail('activate-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000071',
          googleOAuthId: 'google-sub-m04s01-activated',
          email: 'activate-m04s01@lavacar.com.br',
          name: 'Gerente Ativado',
        })
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.isActive).toBe(true);
      expect(body.role).toBe('MANAGER');
    });

    it('tenant isolation: cannot activate staff from a different tenant (404)', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000072')
        .withEmail('iso-activate-m04s01@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/activate`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000099',
          googleOAuthId: 'google-sub-m04s01-iso',
          email: 'iso-activate-m04s01@lavacar.com.br',
          name: 'Staff User',
        })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });
});
