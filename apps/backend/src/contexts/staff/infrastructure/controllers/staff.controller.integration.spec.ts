import { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { RequestInterceptor } from '../../../../shared/request/request.interceptor';
import { RequestModule } from '../../../../shared/request/request.module';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { StaffEntity } from '../entities/staff.entity';
import { StaffModule } from '../../staff.module';

const TENANT_A = '10000000-0000-4000-8000-000000000100';
const TENANT_B = '10000000-0000-4000-8000-000000000101';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('StaffController (integration) — management endpoints', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
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
        RequestModule,
        StaffModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: RequestInterceptor },
        { provide: TENANT_SETTINGS_PORT, useClass: InMemoryTenantSettingsPort },
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
  });

  describe('GET /staff', () => {
    it('returns 403 when no auth headers are provided', async () => {
      const { body } = await request(app.getHttpServer()).get('/staff').expect(403);
      expect(body.status ?? body.statusCode).toBe(403);
    });

    it('returns empty list when tenant has no staff', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/staff')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    it('returns staff for the tenant from RequestContext with pagination metadata', async () => {
      const e1 = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('list1-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      const e2 = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('list2-m04s04@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(e1);
      await ds.getRepository(StaffEntity).save(e2);

      const { body } = await request(app.getHttpServer())
        .get('/staff')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items.length).toBeGreaterThanOrEqual(2);
      expect(body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('tenant isolation: does not return staff from other tenants', async () => {
      const eA = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('iso-list-a-m04s04@lavacar.com.br')
        .withIsActive(false)
        .build();
      const eB = new StaffEntityBuilder()
        .withTenantId(TENANT_B)
        .withEmail('iso-list-b-m04s04@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(eA);
      await ds.getRepository(StaffEntity).save(eB);

      const { body } = await request(app.getHttpServer())
        .get('/staff')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items.every((i: { id: string }) => i.id !== eB.id)).toBe(true);
    });
  });

  describe('GET /staff/:id', () => {
    it('returns 404 when staff does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/staff/10000000-0000-4000-8000-000000000199')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns staff member with correct shape', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('detail-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/staff/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.id).toBe(entity.id);
      expect(body.email).toBe('detail-m04s04@lavacar.com.br');
      expect(body.isActive).toBe(false);
    });

    it('tenant isolation: returns 404 for staff belonging to another tenant', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_B)
        .withEmail('iso-detail-m04s04@lavacar.com.br')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/staff/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('POST /staff/invite', () => {
    it('creates an active staff row using tenantId from RequestContext', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/staff/invite')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({
          email: 'invite-m04s04@lavacar.com.br',
          firstName: 'João',
          lastName: 'Silva',
          role: 'STAFF',
        })
        .expect(201);

      expect(body.email).toBe('invite-m04s04@lavacar.com.br');
      expect(body.isActive).toBe(true);

      const row = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { id: body.staffId, tenantId: TENANT_A } });
      expect(row).not.toBeNull();
    });

    it('returns 409 when email is already active in the same tenant', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('active-m04s04@lavacar.com.br')
        .withGoogleOAuthId('google-sub-m04s04-active')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post('/staff/invite')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({
          email: 'active-m04s04@lavacar.com.br',
          firstName: 'M',
          lastName: 'C',
          role: 'STAFF',
        })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('tenant isolation: invited staff row belongs to tenant from RequestContext', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/staff/invite')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({
          email: 'iso-invite-m04s04@lavacar.com.br',
          firstName: 'C',
          lastName: 'L',
          role: 'MANAGER',
        })
        .expect(201);

      const rowInB = await ds
        .getRepository(StaffEntity)
        .findOne({ where: { tenantId: TENANT_B, email: 'iso-invite-m04s04@lavacar.com.br' } });
      expect(rowInB).toBeNull();
      expect(body.staffId).toBeDefined();
    });
  });

  describe('PATCH /staff/:id', () => {
    it('updates name and role, returns 200', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('update-m13s43@lavacar.com.br')
        .withRole('STAFF')
        .withGoogleOAuthId('google-update-m13s43')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ name: 'Nome Editado', role: 'MANAGER' })
        .expect(200);

      expect(body.staffId).toBe(entity.id);
      expect(body.name).toBe('Nome Editado');
      expect(body.role).toBe('MANAGER');

      const row = await ds.getRepository(StaffEntity).findOne({ where: { id: entity.id } });
      expect(row!.name).toBe('Nome Editado');
      expect(row!.role).toBe('MANAGER');
      expect(row!.email).toBe('update-m13s43@lavacar.com.br');
    });

    it('returns 400 when name is empty', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('update-empty-m13s43@lavacar.com.br')
        .withRole('STAFF')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ name: '', role: 'STAFF' })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 404 when staff does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/staff/10000000-0000-4000-8000-000000000199')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ name: 'Nome', role: 'STAFF' })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 409 when demoting the last active MANAGER', async () => {
      // Isolated tenant to avoid contamination from other tests that create MANAGERs in TENANT_A
      const lastMgrTenant = '10000000-0000-4000-8000-000000000111';
      const onlyManager = new StaffEntityBuilder()
        .withTenantId(lastMgrTenant)
        .withEmail('update-last-mgr-m13s43@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-update-last-mgr-m13s43')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(onlyManager);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${onlyManager.id}`)
        .set(actorHeaders(lastMgrTenant, MANAGER_ID))
        .send({ name: onlyManager.name ?? 'Nome', role: 'STAFF' })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('tenant isolation: returns 404 for staff belonging to another tenant', async () => {
      const entity = new StaffEntityBuilder()
        .withTenantId(TENANT_B)
        .withEmail('iso-update-m13s43@lavacar.com.br')
        .withRole('STAFF')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ name: 'Nome', role: 'STAFF' })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 403 when no auth headers are provided', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/staff/10000000-0000-4000-8000-000000000199')
        .send({ name: 'Nome', role: 'STAFF' })
        .expect(403);

      expect(body.status ?? body.statusCode).toBe(403);
    });
  });

  describe('PATCH /staff/:id/deactivate', () => {
    it('deactivates a STAFF member and returns 200', async () => {
      const managerEntity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('mgr-deact-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-mgr-deact-m04s04')
        .withIsActive(true)
        .build();
      const staffEntity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('staff-deact-m04s04@lavacar.com.br')
        .withRole('STAFF')
        .withGoogleOAuthId('google-staff-deact-m04s04')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(managerEntity);
      await ds.getRepository(StaffEntity).save(staffEntity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${staffEntity.id}/deactivate`)
        .set(actorHeaders(TENANT_A, managerEntity.id))
        .expect(200);

      expect(body.staffId).toBe(staffEntity.id);
      expect(body.isActive).toBe(false);

      const row = await ds.getRepository(StaffEntity).findOne({ where: { id: staffEntity.id } });
      expect(row!.isActive).toBe(false);
    });

    it('returns 403 when attempting to deactivate own account', async () => {
      const managerEntity = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('self-deact-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-self-deact-m04s04')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(managerEntity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${managerEntity.id}/deactivate`)
        .set(actorHeaders(TENANT_A, managerEntity.id))
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns 409 when deactivating the last active MANAGER', async () => {
      // Isolated tenant to avoid contamination from other tests that create MANAGERs in TENANT_A
      const lastMgrTenant = '10000000-0000-4000-8000-000000000110';
      const onlyManager = new StaffEntityBuilder()
        .withTenantId(lastMgrTenant)
        .withEmail('last-mgr-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-last-mgr-m04s04')
        .withIsActive(true)
        .build();
      const actor = new StaffEntityBuilder()
        .withTenantId(lastMgrTenant)
        .withEmail('actor-m04s04@lavacar.com.br')
        .withRole('MANAGER')
        .withGoogleOAuthId('google-actor-m04s04')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(onlyManager);
      await ds.getRepository(StaffEntity).save(actor);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${onlyManager.id}/deactivate`)
        .set(actorHeaders(lastMgrTenant, actor.id))
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('tenant isolation: returns 404 for staff belonging to another tenant', async () => {
      const staffEntity = new StaffEntityBuilder()
        .withTenantId(TENANT_B)
        .withEmail('iso-deact-m04s04@lavacar.com.br')
        .withRole('STAFF')
        .withGoogleOAuthId('google-iso-deact-m04s04')
        .withIsActive(true)
        .build();
      await ds.getRepository(StaffEntity).save(staffEntity);

      const { body } = await request(app.getHttpServer())
        .patch(`/staff/${staffEntity.id}/deactivate`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 403 when no auth headers are provided', async () => {
      const { body } = await request(app.getHttpServer()).get('/staff').expect(403);
      expect(body.status ?? body.statusCode).toBe(403);
    });
  });
});
