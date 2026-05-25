import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { ScheduleOpeningEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';

const TEST_KEY = 'opening-integ-test-key-opening-xxxx'; // 36 chars

const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

// Default TenantSettings has sunday=null (closed) and Mon–Sat open.
const CLOSED_DAY = nextWeekday(0); // Sunday
const OPEN_DAY = nextWeekday(1); // Monday — already open in business_hours

describe('ScheduleOpeningController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [EventBusModule, PlatformModule],
      overrideEventBus: true,
    }));

    // Seed tenants via the canonical API — no direct DB access to the platform context.
    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Opening Tenant A', slug: 'opening-tenant-a', adminEmail: 'a@opening.test' })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Opening Tenant B', slug: 'opening-tenant-b', adminEmail: 'b@opening.test' })
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

    it('returns 422 when day is already open in business_hours', async () => {
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
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Opening List Tenant',
          slug: 'opening-tenant-list',
          adminEmail: 'list@opening.test',
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
});
