import { INestApplication } from '@nestjs/common';
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
} from '../../test/component-test.helpers';
import { SchedulingExceptionBulkResultResponse } from './scheduling-exceptions.types';

const ID_A = '30000000-0000-4000-8000-00000000000a';

const bulkResult: SchedulingExceptionBulkResultResponse = {
  results: [{ exceptionId: ID_A, outcome: 'RESOLVED' }],
};

describe('SchedulingExceptionsController (component)', () => {
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

  describe('GET /v1/scheduling-exceptions', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/scheduling-exceptions');
      expect(res.status).toBe(401);
    });

    it.each([
      ['STAFF', makeStaffJwt],
      ['CUSTOMER', makeCustomerJwt],
    ])('returns 403 for %s (MANAGER-only)', async (_role, makeJwt) => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/scheduling-exceptions')
        .set('Authorization', `Bearer ${makeJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, forwards the status filter', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ items: [] });

      const res = await request(app.getHttpServer())
        .get('/v1/scheduling-exceptions?status=OPEN')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/scheduling-exceptions', {
        status: 'OPEN',
      });
    });

    it('rejects an unknown status with 400', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/scheduling-exceptions?status=DONE')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /v1/scheduling-exceptions/resolve', () => {
    const body = { exceptionIds: [ID_A], resolutionType: 'KEEP' };

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/resolve')
        .send(body);
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/resolve')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send(body);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200 with the per-entry results', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(bulkResult);

      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/resolve')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(bulkResult);
      expect(backendHttpService.post).toHaveBeenCalledWith('/scheduling-exceptions/resolve', body);
    });

    it.each([
      ['REASSIGN without a target', { exceptionIds: [ID_A], resolutionType: 'REASSIGN' }],
      ['RESCHEDULE without scheduledAt', { exceptionIds: [ID_A], resolutionType: 'RESCHEDULE' }],
      ['an empty id list', { exceptionIds: [], resolutionType: 'KEEP' }],
    ])('rejects %s with 400 before reaching the backend', async (_label, invalid) => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/resolve')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(invalid);

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/scheduling-exceptions/dismiss', () => {
    const body = { exceptionIds: [ID_A], reason: 'handled by phone' };

    it('returns 403 for CUSTOMER', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/dismiss')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send(body);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200 with the per-entry results', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(bulkResult);

      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/dismiss')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(body);

      expect(res.status).toBe(200);
      expect(backendHttpService.post).toHaveBeenCalledWith('/scheduling-exceptions/dismiss', body);
    });

    it('rejects a missing reason with 400', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/scheduling-exceptions/dismiss')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ exceptionIds: [ID_A] });
      expect(res.status).toBe(400);
    });
  });
});
