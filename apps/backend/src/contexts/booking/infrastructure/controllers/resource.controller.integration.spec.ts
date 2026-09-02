import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceType } from '../../domain/resource.types';

const TENANT_A = '10000000-0000-4000-8000-000000000400';
const TENANT_B = '10000000-0000-4000-8000-000000000401';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('ResourceController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /resources ────────────────────────────────────────────────────────

  describe('POST /resources', () => {
    it('creates a ROOM resource and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ type: 'ROOM', name: 'Estúdio 1', maxCapacity: 12 })
        .expect(201);

      expect(body.id).toBeDefined();
      expect(body.type).toBe('ROOM');
      expect(body.maxCapacity).toBe(12);
      expect(body.isActive).toBe(true);
    });

    it('is retrievable via GET /resources after creation', async () => {
      await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ type: 'EQUIPMENT', name: 'Máquina 1' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items.some((r: { name: string }) => r.name === 'Máquina 1')).toBe(true);
    });

    it('returns 422 for type=LOCATION (never manually created — backfill migration only)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ type: 'LOCATION', name: 'Unidade Única' })
        .expect(422);

      expect(body.status).toBe(422);
      expect(body.code).toBe('BOOKING_RESOURCE_TYPE_NOT_CREATABLE');
    });

    it('returns 403 for STAFF role', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(TENANT_A, MANAGER_ID, 'STAFF'))
        .send({ type: 'ROOM', name: 'Estúdio 2' })
        .expect(403);

      expect(body.status).toBe(403);
    });
  });

  // ─── PATCH /resources/:id ───────────────────────────────────────────────────

  describe('PATCH /resources/:id', () => {
    it('updates working hours and returns 200', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_A).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({
          workingHours: {
            monday: { open: '10:00', close: '16:00' },
            tuesday: null,
            wednesday: null,
            thursday: null,
            friday: null,
            saturday: null,
            sunday: null,
          },
        })
        .expect(200);

      expect(body.workingHours.monday).toEqual({ open: '10:00', close: '16:00' });
    });

    it('returns 404 for a cross-tenant resource id', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_B).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ workingHours: null })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  // ─── DELETE /resources/:id ──────────────────────────────────────────────────

  describe('DELETE /resources/:id', () => {
    it('deactivates a resource and returns 204', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_A).build();
      await ds.getRepository(ResourceEntity).save(entity);

      await request(app.getHttpServer())
        .delete(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(204);

      const found = await ds.getRepository(ResourceEntity).findOne({ where: { id: entity.id } });
      expect(found!.isActive).toBe(false);
    });

    it('returns 404 for a cross-tenant resource id', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_B).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 409 for a LOCATION resource — a tenant must always retain one active LOCATION', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_B)
        .withType(ResourceType.LOCATION)
        .withRefId(null)
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_B, MANAGER_ID))
        .expect(409);

      expect(body.status).toBe(409);
      expect(body.code).toBe('BOOKING_RESOURCE_LOCATION_CANNOT_BE_DEACTIVATED');
      const found = await ds.getRepository(ResourceEntity).findOne({ where: { id: entity.id } });
      expect(found!.isActive).toBe(true);
    });
  });

  // ─── POST /resources/:id/reactivate ─────────────────────────────────────────

  describe('POST /resources/:id/reactivate', () => {
    it('reactivates a resource and returns 200', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_A).withIsActive(false).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/resources/${entity.id}/reactivate`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.isActive).toBe(true);
    });

    it('returns 409 when already active', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_A).withIsActive(true).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/resources/${entity.id}/reactivate`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('returns 404 for a STAFF resource whose staff member is still inactive', async () => {
      const staff = new StaffEntityBuilder()
        .withTenantId(TENANT_A)
        .withEmail('ines@lavacar.com.br')
        .withRole('STAFF')
        .withIsActive(false)
        .build();
      await ds.getRepository(StaffEntity).save(staff);

      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.STAFF)
        .withRefId(staff.id)
        .withIsActive(false)
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/resources/${entity.id}/reactivate`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
      const found = await ds.getRepository(ResourceEntity).findOne({ where: { id: entity.id } });
      expect(found!.isActive).toBe(false);
    });
  });

  // ─── GET /resources — tenant isolation ──────────────────────────────────────

  describe('GET /resources', () => {
    const LIST_TENANT_A = '10000000-0000-4000-8000-000000000402';
    const LIST_TENANT_B = '10000000-0000-4000-8000-000000000403';

    beforeAll(async () => {
      const repo = ds.getRepository(ResourceEntity);
      await repo.save(
        new ResourceEntityBuilder().withTenantId(LIST_TENANT_A).withName('Tenant A Room').build(),
      );
      await repo.save(
        new ResourceEntityBuilder().withTenantId(LIST_TENANT_B).withName('Tenant B Room').build(),
      );
    });

    it("never returns another tenant's resources", async () => {
      const { body } = await request(app.getHttpServer())
        .get('/resources')
        .set(actorHeaders(LIST_TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items.every((r: { name: string }) => r.name !== 'Tenant B Room')).toBe(true);
    });

    it('filters by type', async () => {
      const repo = ds.getRepository(ResourceEntity);
      await repo.save(
        new ResourceEntityBuilder()
          .withTenantId(LIST_TENANT_A)
          .withType(ResourceType.EQUIPMENT)
          .withName('Máquina X')
          .build(),
      );

      const { body } = await request(app.getHttpServer())
        .get('/resources?type=EQUIPMENT')
        .set(actorHeaders(LIST_TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items.every((r: { type: string }) => r.type === 'EQUIPMENT')).toBe(true);
    });
  });
});
