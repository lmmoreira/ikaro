import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ScheduleOpeningEntityBuilder,
  ResourceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { ResourceEntity } from '../entities/resource.entity';

const TEST_KEY = 'opening-integ-test-key-opening-xxxx'; // 36 chars

const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

// Default TenantSettings has sunday=null (closed) and Mon–Sat open.
const CLOSED_DAY = nextWeekday(0); // Sunday
const OPEN_DAY = nextWeekday(1); // Monday — already open in businessHours

describe('ScheduleOpeningController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [PlatformModule],
    }));

    // Seed tenants via the canonical API — no direct DB access to the platform context.
    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Opening Tenant A',
        slug: 'opening-tenant-a',
        adminEmail: 'a@opening.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Opening Tenant B',
        slug: 'opening-tenant-b',
        adminEmail: 'b@opening.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantBId = b.tenantId as string;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  // ─── POST /schedule/openings ─────────────────────────────────────────────────

  describe('POST /schedule/openings', () => {
    it('creates an opening for a normally-closed day and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date: CLOSED_DAY, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      expect(body.id).toBeDefined();
      expect(body.date).toBe(CLOSED_DAY);
      expect(body.startTime).toBe('09:00');
      expect(body.endTime).toBe('14:00');
    });

    it('returns 422 for a past date', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date: pastDate(), startTime: '09:00', endTime: '14:00' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 422 when day is already open in businessHours', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date: OPEN_DAY, startTime: '09:00', endTime: '14:00' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 409 when an opening already exists for that date', async () => {
      const date = nextWeekday(0, 2); // use a different Sunday to avoid collision
      await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '10:00', endTime: '13:00' })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID, 'CUSTOMER'))
        .send({ date: futureDate(30), startTime: '09:00', endTime: '14:00' })
        .expect(403);

      expect(body).toBeDefined();
    });
  });

  // ─── DELETE /schedule/openings/:id ──────────────────────────────────────────

  describe('DELETE /schedule/openings/:id', () => {
    it('removes an opening and returns 204', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withTenantId(tenantAId)
        .withDate(futureDate(15))
        .build();
      await ds.getRepository(ScheduleOpeningEntity).save(entity);

      await request(app.getHttpServer())
        .delete(`/schedule/openings/${entity.id}`)
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .expect(204);

      const found = await ds
        .getRepository(ScheduleOpeningEntity)
        .findOne({ where: { id: entity.id } });
      expect(found).toBeNull();
    });

    it('returns 404 when opening does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .delete('/schedule/openings/00000000-0000-4000-8000-000000000099')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot delete an opening from another tenant', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withTenantId(tenantBId)
        .withDate(futureDate(16))
        .build();
      await ds.getRepository(ScheduleOpeningEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/schedule/openings/${entity.id}`)
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  // ─── GET /schedule/openings ──────────────────────────────────────────────────

  describe('GET /schedule/openings', () => {
    let listTenantId: string;

    beforeAll(async () => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: 'Opening List Tenant',
          slug: 'opening-tenant-list',
          adminEmail: 'list@opening.test',
          country_code: 'BR',
        })
        .expect(201);
      listTenantId = body.tenantId as string;

      const repo = ds.getRepository(ScheduleOpeningEntity);
      await repo.save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(listTenantId)
          .withDate('2026-10-05')
          .build(),
      );
      await repo.save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(listTenantId)
          .withDate('2026-10-19')
          .build(),
      );
    });

    it('returns all openings in range sorted by date', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/schedule/openings?from=2026-10-01&to=2026-10-31')
        .set(actorHeaders(listTenantId, MANAGER_ID))
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.items[0].date).toBe('2026-10-05');
      expect(body.items[1].date).toBe('2026-10-19');
    });

    it('does not return openings from another tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/schedule/openings?from=2026-10-01&to=2026-10-31')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .expect(200);

      expect(
        body.items.every((i: { date: string }) => !['2026-10-05', '2026-10-19'].includes(i.date)),
      ).toBe(true);
    });
  });

  // ─── resourceId (M21 Cluster 1) ──────────────────────────────────────────────

  describe('resourceId (M21 Cluster 1)', () => {
    it('MANAGER creates a resource-scoped opening when a tenant-wide opening already covers it', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resource);
      const date = nextWeekday(0, 5);

      await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({
          date,
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
        })
        .expect(201);

      expect(body.resourceId).toBe(resource.id);
    });

    it('returns 403 when STAFF sets resourceId', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resource);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID, 'STAFF'))
        .send({
          date: nextWeekday(0, 6),
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
        })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('STAFF can still create a tenant-wide opening (resourceId omitted)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID, 'STAFF'))
        .send({ date: nextWeekday(0, 7), startTime: '09:00', endTime: '14:00' })
        .expect(201);

      expect(body.resourceId).toBeNull();
    });

    it('returns 404 when resourceId belongs to another tenant', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantBId).build();
      await ds.getRepository(ResourceEntity).save(resource);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({
          date: nextWeekday(0, 8),
          startTime: '09:00',
          endTime: '14:00',
          resourceId: resource.id,
        })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 422 when a resource-scoped window extends beyond an existing tenant-wide opening', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resource);
      const date = nextWeekday(0, 9);

      await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '09:00', endTime: '14:00' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '08:00', endTime: '15:00', resourceId: resource.id })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 422 when no tenant-wide opening exists yet for a date closed for the tenant (M21 Cluster 1, Codex PR #460 round-3 finding)', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resource);
      const date = nextWeekday(0, 10); // Sunday — closed for the tenant, no tenant-wide opening created

      const { body } = await request(app.getHttpServer())
        .post('/schedule/openings')
        .set(actorHeaders(tenantAId, MANAGER_ID))
        .send({ date, startTime: '09:00', endTime: '14:00', resourceId: resource.id })
        .expect(422);

      expect(body.status).toBe(422);
    });
  });

  // ─── two-partial-index migration (M21 Cluster 1) ─────────────────────────────

  describe('two-partial-index migration (M21 Cluster 1)', () => {
    it('a tenant-wide and a resource-scoped opening for the same date coexist; a second in either scope is rejected at the DB level', async () => {
      const resource = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resource);
      const date = futureDate(300);
      const openingRepo = ds.getRepository(ScheduleOpeningEntity);

      await openingRepo.save(
        new ScheduleOpeningEntityBuilder().withTenantId(tenantAId).withDate(date).build(),
      );
      await openingRepo.save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(tenantAId)
          .withResourceId(resource.id)
          .withDate(date)
          .build(),
      );

      await expect(
        openingRepo.save(
          new ScheduleOpeningEntityBuilder().withTenantId(tenantAId).withDate(date).build(),
        ),
      ).rejects.toThrow();

      await expect(
        openingRepo.save(
          new ScheduleOpeningEntityBuilder()
            .withTenantId(tenantAId)
            .withResourceId(resource.id)
            .withDate(date)
            .build(),
        ),
      ).rejects.toThrow();
    });

    it('two different resources each get their own opening for the same date without colliding', async () => {
      const resourceA = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      const resourceB = new ResourceEntityBuilder().withTenantId(tenantAId).build();
      await ds.getRepository(ResourceEntity).save(resourceA);
      await ds.getRepository(ResourceEntity).save(resourceB);
      const date = futureDate(301);
      const openingRepo = ds.getRepository(ScheduleOpeningEntity);

      await openingRepo.save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(tenantAId)
          .withResourceId(resourceA.id)
          .withDate(date)
          .build(),
      );

      const savedB = await openingRepo.save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(tenantAId)
          .withResourceId(resourceB.id)
          .withDate(date)
          .build(),
      );

      expect(savedB.resourceId).toBe(resourceB.id);
    });
  });
});
