import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus/event-bus.module';
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
      expect(body.code).toBe('GENERIC_FIELD_REQUIRED');
    });

    it('returns 200 with empty array when no staff is found for the given googleOAuthId', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-oauth?googleOAuthId=google-sub-m03s07-unknown')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body).toEqual([]);
    });

    it('returns array with one result for an active staff member', async () => {
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

      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].staffId).toBe(entity.id);
      expect(body[0].tenantId).toBe('00000000-0000-0000-0000-000000000050');
      expect(body[0].role).toBe('MANAGER');
      expect(body[0].isActive).toBe(true);
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

      expect(body).toHaveLength(1);
      expect(body[0].isActive).toBe(false);
      expect(body[0].role).toBe('STAFF');
    });

    it('tenant isolation: same googleOAuthId in different tenants returns both records', async () => {
      const sharedSub = 'google-sub-m03s07-multi-tenant';
      const entityA = new StaffEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000052')
        .withGoogleOAuthId(sharedSub)
        .withEmail('staff-a-m03s07@tenanta.com.br')
        .withIsActive(true)
        .build();
      const entityB = new StaffEntityBuilder()
        .withTenantId('00000000-0000-0000-0000-000000000053')
        .withGoogleOAuthId(sharedSub)
        .withEmail('staff-b-m03s07@tenantb.com.br')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entityA);
      await ds.getRepository(StaffEntity).save(entityB);

      const { body } = await request(app.getHttpServer())
        .get(`/internal/staff/by-oauth?googleOAuthId=${sharedSub}`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body).toHaveLength(2);
      const tenantIds = body.map((s: { tenantId: string }) => s.tenantId);
      expect(tenantIds).toContain('00000000-0000-0000-0000-000000000052');
      expect(tenantIds).toContain('00000000-0000-0000-0000-000000000053');
    });
  });

  describe('GET /internal/staff/by-email', () => {
    it('returns 400 when email is absent', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-email?tenantId=10000000-0000-4000-8000-000000000060')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(400);
      expect(body.status).toBe(400);
      expect(body.code).toBe('GENERIC_FIELD_REQUIRED');
    });

    it("returns 400 with GENERIC_FIELD_REQUIRED when tenantId is absent — caught by CanonicalParseUUIDPipe's own missing-value check, not the controller body's", async () => {
      const response = await request(app.getHttpServer())
        .get('/internal/staff/by-email?email=staff@lavacar.com.br')
        .set('X-Internal-Key', INTERNAL_KEY);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('GENERIC_FIELD_REQUIRED');
    });

    it('returns 400 with the canonical envelope when tenantId is not a valid UUID (CanonicalParseUUIDPipe)', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/staff/by-email?email=staff@lavacar.com.br&tenantId=not-a-uuid')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(400);
      expect(body.type).toBe('about:blank');
      expect(body.code).toBe('GENERIC_FORMAT_INVALID');
      expect(body.field).toBe('tenantId');
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

    it('returns GetStaffByEmailUseCaseResult for an active staff (not yet linked)', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000060')
        .withEmail('invited-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(true)
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
      expect(body.isActive).toBe(true);
    });

    it('tenant isolation: same email in different tenant returns 404', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000061')
        .withEmail('iso-m04s01@lavacar.com.br')
        .withIsActive(true)
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

  describe('POST /internal/staff/:staffId/link-google', () => {
    it('returns 404 when staffId does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/staff/10000000-0000-4000-8000-000000009999/link-google')
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
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/link-google`)
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

    it('links google account, persists name, and returns 200 with result', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000071')
        .withEmail('activate-m04s01@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/link-google`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000071',
          googleOAuthId: 'google-sub-m04s01-activated',
          email: 'activate-m04s01@lavacar.com.br',
          name: 'Gerente Vinculado',
        })
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.role).toBe('MANAGER');
      expect(body.tenantId).toBe('10000000-0000-4000-8000-000000000071');

      const saved = await ds.getRepository(StaffEntity).findOneBy({ id: entity.id });
      expect(saved?.googleOAuthId).toBe('google-sub-m04s01-activated');
      expect(saved?.name).toBe('Gerente Vinculado');
    });

    it('returns 403 when staff is deactivated', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000073')
        .withEmail('deactivated-link@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/link-google`)
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({
          tenantId: '10000000-0000-4000-8000-000000000073',
          googleOAuthId: 'google-sub-deactivated',
          email: 'deactivated-link@lavacar.com.br',
          name: 'Staff User',
        })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('tenant isolation: cannot link google account for staff from a different tenant (404)', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId('10000000-0000-4000-8000-000000000072')
        .withEmail('iso-activate-m04s01@lavacar.com.br')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/internal/staff/${entity.id}/link-google`)
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
