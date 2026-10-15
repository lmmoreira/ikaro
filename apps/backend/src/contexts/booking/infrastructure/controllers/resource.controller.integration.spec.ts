import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  FutureCommitmentExceptionEntityBuilder,
  ResourceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceType } from '../../domain/resource.types';

const TENANT_A = '10000000-0000-4000-8000-000000000400';
const TENANT_B = '10000000-0000-4000-8000-000000000401';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('ResourceController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;

  beforeAll(async () => {
    ({ app, ds, eventBus } = await createBookingIntegrationApp());
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

  // ─── GET /resources/:id ─────────────────────────────────────────────────────

  describe('GET /resources/:id', () => {
    it('returns the resource', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withName('Estúdio 1')
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.id).toBe(entity.id);
      expect(body.name).toBe('Estúdio 1');
    });

    it('returns 404 for a cross-tenant resource id', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_B).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 403 for STAFF role', async () => {
      const entity = new ResourceEntityBuilder().withTenantId(TENANT_A).build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID, 'STAFF'))
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

    it('updates name, type, and maxCapacity and returns 200', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .withName('Estúdio 1')
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ name: 'Estúdio 2', type: 'EQUIPMENT', maxCapacity: 4 })
        .expect(200);

      expect(body.name).toBe('Estúdio 2');
      expect(body.type).toBe('EQUIPMENT');
      expect(body.maxCapacity).toBe(4);
    });

    it('accepts an empty body and leaves the resource unchanged', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withName('Estúdio Inalterado')
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({})
        .expect(200);

      expect(body.name).toBe('Estúdio Inalterado');
    });

    it('returns 409 when changing a LOCATION resource away from type=LOCATION', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.LOCATION)
        .withRefId(null)
        .build();
      await ds.getRepository(ResourceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/resources/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ type: 'ROOM' })
        .expect(409);

      expect(body.status).toBe(409);
      expect(body.code).toBe('BOOKING_RESOURCE_LOCATION_TYPE_IMMUTABLE');
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

    describe('worklist entries (M23-S45)', () => {
      const exceptionRepo = () => ds.getRepository(FutureCommitmentExceptionEntity);
      const seedInactiveResource = async (tenantId: string) => {
        const resource = new ResourceEntityBuilder()
          .withTenantId(tenantId)
          .withIsActive(false)
          .build();
        await ds.getRepository(ResourceEntity).save(resource);
        return resource;
      };

      beforeEach(() => {
        eventBus.published.length = 0;
      });

      it("closes the resource's OPEN entries as the reactivating manager and records one Dismissed event each", async () => {
        const resource = await seedInactiveResource(TENANT_A);
        const open = [1, 2].map(() =>
          new FutureCommitmentExceptionEntityBuilder()
            .withTenantId(TENANT_A)
            .withSourceId(resource.id)
            .build(),
        );
        const alreadyResolved = new FutureCommitmentExceptionEntityBuilder()
          .withTenantId(TENANT_A)
          .withSourceId(resource.id)
          .withResolution('KEEP', MANAGER_ID)
          .build();
        await exceptionRepo().save([...open, alreadyResolved]);

        await request(app.getHttpServer())
          .post(`/resources/${resource.id}/reactivate`)
          .set(actorHeaders(TENANT_A, MANAGER_ID))
          .expect(200);

        const rows = await exceptionRepo().find({ where: { sourceId: resource.id } });
        const closed = rows.filter((r) => open.some((o) => o.id === r.id));
        expect(closed).toHaveLength(2);
        for (const row of closed) {
          expect(row.status).toBe('DISMISSED');
          expect(row.resolutionReason).toBe('RESOURCE_REACTIVATED');
          expect(row.resolvedByStaffId).toBe(MANAGER_ID);
        }
        expect(rows.find((r) => r.id === alreadyResolved.id)!.status).toBe('RESOLVED');
        expect(
          eventBus.published.filter((e) => e.eventName === 'FutureCommitmentExceptionDismissed'),
        ).toHaveLength(2);
      });

      it("never closes another tenant's entries", async () => {
        const resource = await seedInactiveResource(TENANT_A);
        const otherTenantEntry = new FutureCommitmentExceptionEntityBuilder()
          .withTenantId(TENANT_B)
          .withSourceId(resource.id)
          .build();
        await exceptionRepo().save(otherTenantEntry);

        await request(app.getHttpServer())
          .post(`/resources/${resource.id}/reactivate`)
          .set(actorHeaders(TENANT_A, MANAGER_ID))
          .expect(200);

        const row = await exceptionRepo().findOneOrFail({ where: { id: otherTenantEntry.id } });
        expect(row.status).toBe('OPEN');
      });

      it('closes nothing when the reactivation is rejected (STAFF wrapper with an inactive Staff row)', async () => {
        const staff = new StaffEntityBuilder()
          .withTenantId(TENANT_A)
          .withEmail('rejected-wrapper@lavacar.com.br')
          .withRole('STAFF')
          .withIsActive(false)
          .build();
        await ds.getRepository(StaffEntity).save(staff);
        const wrapper = new ResourceEntityBuilder()
          .withTenantId(TENANT_A)
          .withType(ResourceType.STAFF)
          .withRefId(staff.id)
          .withIsActive(false)
          .build();
        await ds.getRepository(ResourceEntity).save(wrapper);
        const entry = new FutureCommitmentExceptionEntityBuilder()
          .withTenantId(TENANT_A)
          .withSourceId(wrapper.id)
          .build();
        await exceptionRepo().save(entry);

        await request(app.getHttpServer())
          .post(`/resources/${wrapper.id}/reactivate`)
          .set(actorHeaders(TENANT_A, MANAGER_ID))
          .expect(404);

        const row = await exceptionRepo().findOneOrFail({ where: { id: entry.id } });
        expect(row.status).toBe('OPEN');
        expect(eventBus.published).toHaveLength(0);
      });
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
