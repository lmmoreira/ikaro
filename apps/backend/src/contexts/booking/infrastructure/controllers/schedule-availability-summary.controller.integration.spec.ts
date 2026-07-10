import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ScheduleClosureEntityBuilder,
  ScheduleOpeningEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { addDays, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { PlatformModule } from '../../../platform/platform.module';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'summary-integ-test-key-summary-xxxxx'; // 36 chars

// Monday 4 weeks out — anchor for all range tests in this file.
const RANGE_START = nextWeekday(1, 4);
const RANGE_END = addDays(RANGE_START, 6); // the following Sunday

function tenantHeader(tenantId: string): Record<string, string> {
  return { 'x-tenant-id': tenantId, 'x-correlation-id': 'test-correlation-id' };
}

describe('ScheduleAvailabilitySummaryController (integration)', () => {
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

    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Summary Tenant A',
        slug: 'summary-tenant-a',
        adminEmail: 'a@summary.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: 'Summary Tenant B',
        slug: 'summary-tenant-b',
        adminEmail: 'b@summary.test',
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

  describe('GET /schedule/availability/summary — happy path', () => {
    it('returns one entry per day for a 7-day range', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${serviceId}`,
        )
        .set(tenantHeader(tenantAId))
        .expect(200);

      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(7);

      for (const entry of body as { date: string; available: boolean; slotCount: number }[]) {
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof entry.available).toBe('boolean');
        expect(typeof entry.slotCount).toBe('number');
      }
    });

    it('Mon–Sat entries are available; Sunday entry is not (default businessHours)', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${serviceId}`,
        )
        .set(tenantHeader(tenantAId))
        .expect(200);

      const sunday = body.find((e: { date: string }) => e.date === RANGE_END);
      expect(sunday).toBeDefined();
      expect(sunday.available).toBe(false);
      expect(sunday.slotCount).toBe(0);

      const monday = body.find((e: { date: string }) => e.date === RANGE_START);
      expect(monday).toBeDefined();
      expect(monday.available).toBe(true);
      expect(monday.slotCount).toBeGreaterThan(0);
    });
  });

  // ─── Closure and opening scenarios ───────────────────────────────────────────

  describe('GET /schedule/availability/summary — closures and openings', () => {
    it('day with a full-day closure returns available:false and slotCount:0', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Summary Closure Tenant',
          slug: 'summary-closure',
          adminEmail: 'closure@summary.test',
          country_code: 'BR',
        })
        .expect(201);
      const closureTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(closureTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      const tuesday = addDays(RANGE_START, 1);
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder()
            .withTenantId(closureTenantId)
            .withDate(tuesday)
            .build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${svc.id}`,
        )
        .set(tenantHeader(closureTenantId))
        .expect(200);

      const tuesdayEntry = (body as { date: string; available: boolean; slotCount: number }[]).find(
        (e) => e.date === tuesday,
      );
      expect(tuesdayEntry).toBeDefined();
      expect(tuesdayEntry!.available).toBe(false);
      expect(tuesdayEntry!.slotCount).toBe(0);
    });

    it('Sunday with a ScheduleOpening returns available:true', async () => {
      const { body: tenantBody } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Summary Opening Tenant',
          slug: 'summary-opening',
          adminEmail: 'opening@summary.test',
          country_code: 'BR',
        })
        .expect(201);
      const openingTenantId = tenantBody.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(openingTenantId)
        .withDurationMinutes(30)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);
      await ds.getRepository(ScheduleOpeningEntity).save(
        new ScheduleOpeningEntityBuilder()
          .withTenantId(openingTenantId)
          .withDate(RANGE_END) // Sunday
          .withStartTime('09:00')
          .withEndTime('14:00')
          .build(),
      );

      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${svc.id}`,
        )
        .set(tenantHeader(openingTenantId))
        .expect(200);

      const sundayEntry = (body as { date: string; available: boolean; slotCount: number }[]).find(
        (e) => e.date === RANGE_END,
      );
      expect(sundayEntry).toBeDefined();
      expect(sundayEntry!.available).toBe(true);
      expect(sundayEntry!.slotCount).toBeGreaterThan(0);
    });

    it('past dates in range return available:false without error', async () => {
      const from = pastDate(7);
      const to = pastDate(2);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability/summary?from=${from}&to=${to}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(200);

      expect(Array.isArray(body)).toBe(true);
      expect((body as unknown[]).length).toBeGreaterThan(0);
      for (const entry of body as { available: boolean }[]) {
        expect(entry.available).toBe(false);
      }
    });
  });

  // ─── Validation errors ────────────────────────────────────────────────────────

  describe('GET /schedule/availability/summary — validation errors', () => {
    it('returns 422 when from > to', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_END}&to=${RANGE_START}&serviceIds=${serviceId}`,
        )
        .set(tenantHeader(tenantAId))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 422 when range exceeds 90 days', async () => {
      const to = addDays(RANGE_START, 91);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/availability/summary?from=${RANGE_START}&to=${to}&serviceIds=${serviceId}`)
        .set(tenantHeader(tenantAId))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 for an unknown service ID', async () => {
      const unknownId = '00000000-0000-4000-8000-000000000099';

      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${unknownId}`,
        )
        .set(tenantHeader(tenantAId))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 400 when X-Tenant-ID header is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${serviceId}`,
        )
        .expect(400);

      expect(body.status).toBe(400);
    });
  });

  // ─── Tenant isolation ─────────────────────────────────────────────────────────

  describe('GET /schedule/availability/summary — tenant isolation', () => {
    it("Tenant B's closure does not affect Tenant A's summary", async () => {
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder().withTenantId(tenantBId).withDate(RANGE_START).build(),
        );

      const { body } = await request(app.getHttpServer())
        .get(
          `/schedule/availability/summary?from=${RANGE_START}&to=${RANGE_END}&serviceIds=${serviceId}`,
        )
        .set(tenantHeader(tenantAId))
        .expect(200);

      const mondayEntry = (body as { date: string; available: boolean; slotCount: number }[]).find(
        (e) => e.date === RANGE_START,
      );
      expect(mondayEntry).toBeDefined();
      expect(mondayEntry!.available).toBe(true);
      expect(mondayEntry!.slotCount).toBeGreaterThan(0);
    });
  });
});
