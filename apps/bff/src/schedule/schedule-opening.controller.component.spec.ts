import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  setupActiveGuardMock,
  request,
} from '../test/component-test.helpers';
import { ScheduleOpeningListResponse, ScheduleOpeningResponse } from './schedule.types';

const OPENING_ID = '30000000-0000-4000-8000-000000000002';

const mockOpening: ScheduleOpeningResponse = {
  id: OPENING_ID,
  date: '2026-12-28',
  startTime: '09:00',
  endTime: '14:00',
  notes: null,
  createdBy: '20000000-0000-4000-8000-000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockListResponse: ScheduleOpeningListResponse = { items: [mockOpening] };

describe('ScheduleOpeningController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /v1/schedule/openings ───────────────────────────────────────────────

  describe('GET /v1/schedule/openings', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/schedule/openings?from=2026-12-01&to=2026-12-31',
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when from/to query params are missing (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 when date format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings?from=28-12-2026&to=2026-12-31')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls GET /schedule/openings on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockListResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith(
        '/schedule/openings?from=2026-12-01&to=2026-12-31',
      );
    });

    it('STAFF JWT → 200', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
    });

    it('propagates backend 5xx as 500', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(new HttpException('Internal Server Error', 500));

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/openings?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(500);
    });
  });

  // ─── POST /v1/schedule/openings ─────────────────────────────────────────────

  describe('POST /v1/schedule/openings', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when date format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '28-12-2026', startTime: '09:00', endTime: '14:00' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when startTime format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '9:00', endTime: '14:00' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when endTime is missing (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 201, calls POST /schedule/openings on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockOpening);

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockOpening);
      expect(backendHttpService.post).toHaveBeenCalledWith('/schedule/openings', {
        date: '2026-12-28',
        startTime: '09:00',
        endTime: '14:00',
      });
    });

    it('STAFF JWT → 201', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockOpening);

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });

      expect(res.status).toBe(201);
    });

    it('propagates backend 422 as 422', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Unprocessable Entity', 422));

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });

      expect(res.status).toBe(422);
    });

    it('propagates backend 409 as 409', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Conflict', 409));

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/openings')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-28', startTime: '09:00', endTime: '14:00' });

      expect(res.status).toBe(409);
    });
  });

  // ─── DELETE /v1/schedule/openings/:id ───────────────────────────────────────

  describe('DELETE /v1/schedule/openings/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).delete(`/v1/schedule/openings/${OPENING_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/openings/${OPENING_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 204, calls DELETE /schedule/openings/:id on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/openings/${OPENING_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(204);
      expect(backendHttpService.delete).toHaveBeenCalledWith(`/schedule/openings/${OPENING_ID}`);
    });

    it('STAFF JWT → 204', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/openings/${OPENING_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(204);
    });

    it('propagates backend 404 as 404', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockRejectedValueOnce(new HttpException('Not Found', 404));

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/openings/${OPENING_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });
});
