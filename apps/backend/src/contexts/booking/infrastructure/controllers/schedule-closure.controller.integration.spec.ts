import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ScheduleClosureEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';

const TENANT_A = '10000000-0000-4000-8000-000000000300';
const TENANT_B = '10000000-0000-4000-8000-000000000301';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('ScheduleClosureController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /schedule/closures ─────────────────────────────────────────────────

  describe('POST /schedule/closures', () => {
    it('creates a full-day closure and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: futureDate(10), reason: 'HOLIDAY' })
        .expect(201);

      expect(body.id).toBeDefined();
      expect(body.startTime).toBeNull();
      expect(body.endTime).toBeNull();
      expect(body.reason).toBe('HOLIDAY');
    });

    it('creates a partial closure and returns 201', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: futureDate(11), reason: 'MAINTENANCE', startTime: '08:00', endTime: '10:00' })
        .expect(201);

      expect(body.startTime).toBe('08:00');
      expect(body.endTime).toBe('10:00');
    });

    it('returns 422 for a past date', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date: pastDate(), reason: 'HOLIDAY' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 409 when closing a date that is already fully closed', async () => {
      const date = futureDate(20);
      await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date, reason: 'HOLIDAY' })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .send({ date, reason: 'MAINTENANCE' })
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/schedule/closures')
        .set(actorHeaders(TENANT_A, MANAGER_ID, 'CUSTOMER'))
        .send({ date: futureDate(30), reason: 'HOLIDAY' })
        .expect(403);

      expect(body).toBeDefined();
    });
  });

  // ─── DELETE /schedule/closures/:id ──────────────────────────────────────────

  describe('DELETE /schedule/closures/:id', () => {
    it('removes a closure and returns 204', async () => {
      const entity = new ScheduleClosureEntityBuilder()
        .withTenantId(TENANT_A)
        .withDate(futureDate(15))
        .build();
      await ds.getRepository(ScheduleClosureEntity).save(entity);

      await request(app.getHttpServer())
        .delete(`/schedule/closures/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(204);

      const found = await ds
        .getRepository(ScheduleClosureEntity)
        .findOne({ where: { id: entity.id } });
      expect(found).toBeNull();
    });

    it('returns 404 when closure does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .delete('/schedule/closures/00000000-0000-4000-8000-000000000099')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot delete a closure from another tenant', async () => {
      const entity = new ScheduleClosureEntityBuilder()
        .withTenantId(TENANT_B)
        .withDate(futureDate(16))
        .build();
      await ds.getRepository(ScheduleClosureEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/schedule/closures/${entity.id}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  // ─── GET /schedule/closures ──────────────────────────────────────────────────

  describe('GET /schedule/closures', () => {
    const LIST_TENANT = '10000000-0000-4000-8000-000000000302';
    // Offsets 200/215 (query window 190-230) are deliberately far from every other
    // futureDate(N) offset used elsewhere in this file (10, 11, 20, 30) — hardcoded
    // absolute dates ('2026-09-01'/'2026-09-15') previously collided with the POST
    // block's `futureDate(20)` closure on any run where "today" was 2026-08-12,
    // making "does not return closures from another tenant" fail: TENANT_A's own
    // closure at futureDate(20) landed inside the queried range and coincidentally
    // matched LIST_TENANT's literal fixture date, which the assertion misread as a
    // tenant-isolation leak. Root cause was date-relative-vs-absolute collision in
    // the test fixtures, not the repository's tenant filtering (findByTenantAndDateRange
    // already scopes by `{ tenantId, date: Between(from, to) }`).
    const LIST_DATE_1 = futureDate(200);
    const LIST_DATE_2 = futureDate(215);
    const LIST_FROM = futureDate(190);
    const LIST_TO = futureDate(230);

    beforeAll(async () => {
      const repo = ds.getRepository(ScheduleClosureEntity);
      await repo.save(
        new ScheduleClosureEntityBuilder().withTenantId(LIST_TENANT).withDate(LIST_DATE_1).build(),
      );
      await repo.save(
        new ScheduleClosureEntityBuilder().withTenantId(LIST_TENANT).withDate(LIST_DATE_2).build(),
      );
    });

    it('returns all closures in range sorted by date', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/closures?from=${LIST_FROM}&to=${LIST_TO}`)
        .set(actorHeaders(LIST_TENANT, MANAGER_ID))
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.items[0].date).toBe(LIST_DATE_1);
      expect(body.items[1].date).toBe(LIST_DATE_2);
    });

    it('does not return closures from another tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/closures?from=${LIST_FROM}&to=${LIST_TO}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.items).toHaveLength(0);
    });
  });
});
