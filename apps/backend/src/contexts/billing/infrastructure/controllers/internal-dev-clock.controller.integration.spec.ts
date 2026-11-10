import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { GenericErrorCode } from '@ikaro/types';
import { CLOCK, IClock } from '../../../../shared/ports/clock.port';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';

const INTERNAL_KEY = 'integ-clock-key-integ-clock-key-x'; // 33 chars (≥32)
const HOUR_MS = 60 * 60 * 1000;

describe('InternalDevClockController (integration)', () => {
  describe('local', () => {
    let app: INestApplication;
    let clock: IClock;

    beforeAll(async () => {
      process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
      ({ app } = await createBillingIntegrationApp({
        extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
      }));
      clock = app.get<IClock>(CLOCK);
    });

    afterAll(async () => {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
    });

    afterEach(async () => {
      await request(app.getHttpServer())
        .post('/internal/dev/clock/reset')
        .set('X-Internal-Key', INTERNAL_KEY);
    });

    it('returns 401 without the internal key', async () => {
      await request(app.getHttpServer()).get('/internal/dev/clock').expect(401);
      await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .send({ days: 1 })
        .expect(401);
      await request(app.getHttpServer()).post('/internal/dev/clock/reset').expect(401);
    });

    it('advance shifts IClock.now() for a subsequent call', async () => {
      const before = clock.now().getTime();

      const { body } = await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({ days: 1, hours: 2 })
        .expect(200);

      expect(body.offsetMs).toBe(26 * HOUR_MS);
      expect(clock.now().getTime() - before).toBeGreaterThanOrEqual(26 * HOUR_MS);
    });

    it.each([{ days: -1 }, { days: 1.5 }, {}, { days: 0, hours: 0 }, { days: 1e308 }])(
      'rejects %j with 400 GENERIC_VALUE_OUT_OF_RANGE and leaves the clock alone',
      async (body) => {
        const res = await request(app.getHttpServer())
          .post('/internal/dev/clock/advance')
          .set('X-Internal-Key', INTERNAL_KEY)
          .send(body)
          .expect(400);

        expect(res.body.violations.length).toBeGreaterThan(0);
        expect(
          res.body.violations.every(
            (v: { code: string }) => v.code === GenericErrorCode.VALUE_OUT_OF_RANGE,
          ),
        ).toBe(true);
        const { body: state } = await request(app.getHttpServer())
          .get('/internal/dev/clock')
          .set('X-Internal-Key', INTERNAL_KEY)
          .expect(200);
        expect(state.offsetMs).toBe(0);
      },
    );

    it('rejects a cumulative advance past the cap with 400 and keeps IClock.now() a valid Date', async () => {
      await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({ days: 36_500 })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({ hours: 1 })
        .expect(400);

      expect(res.body.code).toBe(GenericErrorCode.VALUE_OUT_OF_RANGE);
      expect(Number.isNaN(clock.now().getTime())).toBe(false);
    });

    it('GET returns the offset and a stable instanceId', async () => {
      const first = await request(app.getHttpServer())
        .get('/internal/dev/clock')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/internal/dev/clock')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(first.body.instanceId).toEqual(expect.any(String));
      expect(second.body.instanceId).toBe(first.body.instanceId);
    });

    it('reset after an advance returns IClock.now() to real time, and a second reset is a no-op', async () => {
      await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .set('X-Internal-Key', INTERNAL_KEY)
        .send({ days: 3 })
        .expect(200);

      await request(app.getHttpServer())
        .post('/internal/dev/clock/reset')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);
      const second = await request(app.getHttpServer())
        .post('/internal/dev/clock/reset')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(second.body.offsetMs).toBe(0);
      expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
    });
  });

  describe('production', () => {
    let app: INestApplication;

    beforeAll(async () => {
      process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
      ({ app } = await createBillingIntegrationApp({
        appEnv: 'production',
        extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
      }));
    });

    afterAll(async () => {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
    });

    it('answers 404 on every dev clock route', async () => {
      const key = { 'X-Internal-Key': INTERNAL_KEY };
      await request(app.getHttpServer()).get('/internal/dev/clock').set(key).expect(404);
      await request(app.getHttpServer())
        .post('/internal/dev/clock/advance')
        .set(key)
        .send({ days: 1 })
        .expect(404);
      await request(app.getHttpServer()).post('/internal/dev/clock/reset').set(key).expect(404);
    });
  });
});
