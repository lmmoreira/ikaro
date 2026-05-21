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
import { ScheduleClosureListResponse, ScheduleClosureResponse } from './schedule.types';

const CLOSURE_ID = '30000000-0000-4000-8000-000000000001';

const mockClosure: ScheduleClosureResponse = {
  id: CLOSURE_ID,
  date: '2026-12-25',
  startTime: null,
  endTime: null,
  reason: 'HOLIDAY',
  notes: null,
  createdBy: '20000000-0000-4000-8000-000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockListResponse: ScheduleClosureListResponse = { items: [mockClosure] };

describe('ScheduleController (component)', () => {
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

  // ─── GET /v1/schedule/closures ───────────────────────────────────────────────

  describe('GET /v1/schedule/closures', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/schedule/closures?from=2026-12-01&to=2026-12-31',
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/closures?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when from/to query params are missing (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('returns 400 when date format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/closures?from=25-12-2026&to=2026-12-31')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls GET /schedule/closures on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/closures?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockListResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith(
        '/schedule/closures?from=2026-12-01&to=2026-12-31',
      );
    });

    it('STAFF JWT → 200', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/closures?from=2026-12-01&to=2026-12-31')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── POST /v1/schedule/closures ──────────────────────────────────────────────

  describe('POST /v1/schedule/closures', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .send({ date: '2026-12-25', reason: 'HOLIDAY' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'HOLIDAY' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when date format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '25-12-2026', reason: 'HOLIDAY' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when reason is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'INVALID' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when startTime format is invalid (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'MAINTENANCE', startTime: '10:00:00' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 201, calls POST /schedule/closures on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockClosure);

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'HOLIDAY' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockClosure);
      expect(backendHttpService.post).toHaveBeenCalledWith('/schedule/closures', {
        date: '2026-12-25',
        reason: 'HOLIDAY',
      });
    });

    it('MANAGER JWT → 201 for partial closure with startTime/endTime', async () => {
      setupActiveGuardMock(httpService);
      const partialClosure = { ...mockClosure, startTime: '10:00', endTime: '12:00' };
      backendHttpService.post.mockResolvedValueOnce(partialClosure);

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'MAINTENANCE', startTime: '10:00', endTime: '12:00' });

      expect(res.status).toBe(201);
      expect(res.body.startTime).toBe('10:00');
    });

    it('STAFF JWT → 201', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockClosure);

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'HOLIDAY' });

      expect(res.status).toBe(201);
    });

    it('propagates 422 from backend (past date)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ title: 'Unprocessable Entity', status: 422 }, 422),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2020-01-01', reason: 'HOLIDAY' });

      expect(res.status).toBe(422);
    });

    it('propagates 409 from backend (duplicate closure)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ title: 'Conflict', status: 409 }, 409),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/schedule/closures')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ date: '2026-12-25', reason: 'MAINTENANCE' });

      expect(res.status).toBe(409);
    });
  });

  // ─── DELETE /v1/schedule/closures/:id ────────────────────────────────────────

  describe('DELETE /v1/schedule/closures/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).delete(`/v1/schedule/closures/${CLOSURE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/closures/${CLOSURE_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when id is not a UUID (ParseUUIDPipe)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .delete('/v1/schedule/closures/not-a-uuid')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 204, calls DELETE /schedule/closures/:id on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/closures/${CLOSURE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(204);
      expect(backendHttpService.delete).toHaveBeenCalledWith(`/schedule/closures/${CLOSURE_ID}`);
    });

    it('STAFF JWT → 204', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/closures/${CLOSURE_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(204);
    });

    it('propagates 404 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .delete(`/v1/schedule/closures/${CLOSURE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });
});
