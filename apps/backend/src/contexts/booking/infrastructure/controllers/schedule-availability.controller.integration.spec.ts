import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ScheduleClosureEntityBuilder,
  ScheduleOpeningEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'availability-integ-test-key-avail-xx'; // 36 chars

// UTC day-of-week constants (0=Sun, 1=Mon, …, 6=Sat).
const MONDAY = nextWeekday(1);
const SUNDAY = nextWeekday(0);

function tenantHeader(tenantId: string): Record<string, string> {
  return { 'x-tenant-id': tenantId, 'x-correlation-id': 'test-correlation-id' };
}

describe('ScheduleAvailabilityController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [PlatformModule],
    }));

    // Seed base tenants via the canonical API — no direct DB access to the platform context.
    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Avail Tenant A',
        slug: 'avail-tenant-a',
        adminEmail: 'a@avail.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Avail Tenant B',
        slug: 'avail-tenant-b',
        adminEmail: 'b@avail.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantBId = b.tenantId as string;

    const svc = new ServiceEntityBuilder().withTenantId(tenantAId).withDurationMinutes(30).build();
    await ds.getRepository(ServiceEntity).save(svc);
    serviceId = svc.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────────

  describe('GET /schedule/availability — happy path', () => {
    it('returns available slots for an open weekday with no closures', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(200);

      expect(body.date).toBe(MONDAY);
      expect(body.available).toBe(true);
      expect(Array.isArray(body.slots)).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);
      expect(body.slots[0]).toMatchObject({
        startsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        endsAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      });
    });

    it('returns empty slots for a normally-closed day (Sunday)', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${SUNDAY}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(200);

      expect(body.available).toBe(false);
      expect(body.slots).toHaveLength(0);
    });
  });

  // ─── Closure scenarios ────────────────────────────────────────────────────────

  describe('GET /schedule/availability — closure scenarios', () => {
    it('returns empty slots when a full-day closure exists', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Avail Closure Tenant',
          slug: 'avail-closure',
          adminEmail: 'closure@avail.test',
          country_code: 'BR',
        })
        .expect(201);
      const closureTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(closureTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder().withTenantId(closureTenantId).withDate(MONDAY).build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${svc.id}`)
        .set(tenantHeader(closureTenantId))
        .expect(200);

      expect(body.available).toBe(false);
      expect(body.slots).toHaveLength(0);
    });

    it('blocks only the closure window for a partial closure', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Avail Partial Tenant',
          slug: 'avail-partial',
          adminEmail: 'partial@avail.test',
          country_code: 'BR',
        })
        .expect(201);
      const partialTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(partialTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      // Partial closure 10:00-12:00. With 30 min service + 60 min buffer = 90 min total,
      // slots whose window overlaps [10:00, 12:00) are blocked; slots from 12:00 onward are free.
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder()
            .withTenantId(partialTenantId)
            .withDate(MONDAY)
            .withStartTime('10:00')
            .withEndTime('12:00')
            .build(),
        );

      const { body: withoutClosure } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${nextWeekday(2)}&serviceIds=${svc.id}`)
        .set(tenantHeader(partialTenantId))
        .expect(200);

      const { body: withClosure } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${svc.id}`)
        .set(tenantHeader(partialTenantId))
        .expect(200);

      // Partial closure reduces — but does not eliminate — available slots.
      expect(withClosure.available).toBe(true);
      expect(withClosure.slots.length).toBeGreaterThan(0);
      expect(withClosure.slots.length).toBeLessThan(withoutClosure.slots.length);
    });

    it('respects multiple partial closures on the same day', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Avail Multi Tenant',
          slug: 'avail-multi',
          adminEmail: 'multi@avail.test',
          country_code: 'BR',
        })
        .expect(201);
      const multiTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(multiTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      const closureDate = nextWeekday(2); // Tuesday
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder()
            .withTenantId(multiTenantId)
            .withDate(closureDate)
            .withStartTime('09:00')
            .withEndTime('12:00')
            .build(),
        );
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder()
            .withTenantId(multiTenantId)
            .withDate(closureDate)
            .withStartTime('14:00')
            .withEndTime('16:00')
            .build(),
        );

      const { body: noClosures } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${svc.id}`)
        .set(tenantHeader(multiTenantId))
        .expect(200);

      const { body: twoClosures } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${closureDate}&serviceIds=${svc.id}`)
        .set(tenantHeader(multiTenantId))
        .expect(200);

      expect(twoClosures.available).toBe(true);
      expect(twoClosures.slots.length).toBeLessThan(noClosures.slots.length);
    });
  });

  // ─── Opening scenarios ────────────────────────────────────────────────────────

  describe('GET /schedule/availability — opening scenarios', () => {
    it('returns slots for a normally-closed day that has a ScheduleOpening', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Avail Opening Tenant',
          slug: 'avail-opening',
          adminEmail: 'opening@avail.test',
          country_code: 'BR',
        })
        .expect(201);
      const openingTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(openingTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);
      await ds
        .getRepository(ScheduleOpeningEntity)
        .save(
          new ScheduleOpeningEntityBuilder()
            .withTenantId(openingTenantId)
            .withDate(SUNDAY)
            .withStartTime('09:00')
            .withEndTime('14:00')
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${SUNDAY}&serviceIds=${svc.id}`)
        .set(tenantHeader(openingTenantId))
        .expect(200);

      expect(body.available).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);
    });

    it('opening overrides a full-day closure on the same date', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Avail Override Tenant',
          slug: 'avail-override',
          adminEmail: 'override@avail.test',
          country_code: 'BR',
        })
        .expect(201);
      const overrideTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(overrideTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      const openDate = nextWeekday(3); // Wednesday
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder()
            .withTenantId(overrideTenantId)
            .withDate(openDate)
            .build(),
        );
      await ds
        .getRepository(ScheduleOpeningEntity)
        .save(
          new ScheduleOpeningEntityBuilder()
            .withTenantId(overrideTenantId)
            .withDate(openDate)
            .withStartTime('10:00')
            .withEndTime('15:00')
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${openDate}&serviceIds=${svc.id}`)
        .set(tenantHeader(overrideTenantId))
        .expect(200);

      // Opening wins — slots are available despite the full-day closure.
      expect(body.available).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);
    });
  });

  // ─── Validation errors ────────────────────────────────────────────────────────

  describe('GET /schedule/availability — validation errors', () => {
    it('returns 422 for a past date', async () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const past = yesterday.toISOString().slice(0, 10);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${past}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 400 for a service that does not belong to the tenant', async () => {
      const tenantBSvc = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(tenantBSvc);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${tenantBSvc.id}`)
        .set(tenantHeader(tenantAId))
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 for a deactivated service', async () => {
      const inactiveSvc = new ServiceEntityBuilder()
        .withTenantId(tenantAId)
        .withIsActive(false)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(inactiveSvc);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${inactiveSvc.id}`)
        .set(tenantHeader(tenantAId))
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 when X-Tenant-ID header is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${serviceId}`)
        .expect(400);

      expect(body.status).toBe(400);
    });
  });

  // ─── Tenant isolation ─────────────────────────────────────────────────────────

  describe('GET /schedule/availability — tenant isolation', () => {
    it("Tenant B's full-day closure does not affect Tenant A's availability", async () => {
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(new ScheduleClosureEntityBuilder().withTenantId(tenantBId).withDate(MONDAY).build());

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability?date=${MONDAY}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(200);

      expect(body.available).toBe(true);
      expect(body.slots.length).toBeGreaterThan(0);
    });
  });
});
