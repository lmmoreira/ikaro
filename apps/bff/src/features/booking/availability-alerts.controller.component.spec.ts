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

const ALERT_ID = '30000000-0000-4000-8000-00000000000a';
const SERVICE_ID = '30000000-0000-4000-8000-00000000000b';

const createBody = {
  serviceId: SERVICE_ID,
  criteriaType: 'WEEKLY_PREFERENCE',
  weekdays: ['tuesday'],
  localStartTime: '18:00',
  localEndTime: '20:00',
};

describe('AvailabilityAlertsController (component)', () => {
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

  describe.each([
    ['POST', '/v1/availability-alerts', createBody],
    ['GET', '/v1/availability-alerts', undefined],
    ['GET', `/v1/availability-alerts/${ALERT_ID}`, undefined],
    ['PATCH', `/v1/availability-alerts/${ALERT_ID}`, { durationMinutes: 60 }],
    ['DELETE', `/v1/availability-alerts/${ALERT_ID}`, undefined],
  ] as const)('%s %s', (method, path, body) => {
    const call = (token?: string) => {
      const verb = method.toLowerCase() as 'post' | 'get' | 'patch' | 'delete';
      const req = request(app.getHttpServer())[verb](path);
      if (token) req.set('Authorization', `Bearer ${token}`);
      return body ? req.send(body) : req;
    };

    it('returns 401 without a token', async () => {
      expect((await call()).status).toBe(401);
    });

    it.each([
      ['STAFF', makeStaffJwt],
      ['MANAGER', makeManagerJwt],
    ])('returns 403 for %s (CUSTOMER-only)', async (_role, makeJwt) => {
      setupActiveGuardMock(httpService);

      expect((await call(makeJwt(jwtService))).status).toBe(403);
    });
  });

  it('POST: CUSTOMER JWT → 201, forwards the body', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.post.mockResolvedValueOnce({ id: ALERT_ID, status: 'ACTIVE' });

    const res = await request(app.getHttpServer())
      .post('/v1/availability-alerts')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send(createBody);

    expect(res.status).toBe(201);
    expect(backendHttpService.post).toHaveBeenCalledWith('/availability-alerts', createBody);
  });

  it('POST: rejects an invalid body with 400 before reaching the backend', async () => {
    setupActiveGuardMock(httpService);

    const res = await request(app.getHttpServer())
      .post('/v1/availability-alerts')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({ ...createBody, weekdays: [] });

    expect(res.status).toBe(400);
    expect(backendHttpService.post).not.toHaveBeenCalled();
  });

  it('GET: CUSTOMER JWT → 200 with the backend list', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce({ items: [] });

    const res = await request(app.getHttpServer())
      .get('/v1/availability-alerts')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(backendHttpService.get).toHaveBeenCalledWith('/availability-alerts');
  });

  it('GET /:id: CUSTOMER JWT → 200 with the backend alert; rejects a non-uuid id with 400', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.get.mockResolvedValueOnce({ id: ALERT_ID, status: 'EXPIRED' });

    const ok = await request(app.getHttpServer())
      .get(`/v1/availability-alerts/${ALERT_ID}`)
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
    const bad = await request(app.getHttpServer())
      .get('/v1/availability-alerts/not-a-uuid')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: ALERT_ID, status: 'EXPIRED' });
    expect(backendHttpService.get).toHaveBeenCalledWith(`/availability-alerts/${ALERT_ID}`);
    expect(bad.status).toBe(400);
  });

  it('PATCH: CUSTOMER JWT → 200, forwards the id and the body; rejects an empty body with 400', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.patch.mockResolvedValueOnce({ id: ALERT_ID });

    const ok = await request(app.getHttpServer())
      .patch(`/v1/availability-alerts/${ALERT_ID}`)
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({ durationMinutes: 60 });
    const empty = await request(app.getHttpServer())
      .patch(`/v1/availability-alerts/${ALERT_ID}`)
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
      .send({});

    expect(ok.status).toBe(200);
    expect(backendHttpService.patch).toHaveBeenCalledWith(`/availability-alerts/${ALERT_ID}`, {
      durationMinutes: 60,
    });
    expect(empty.status).toBe(400);
  });

  it('DELETE: CUSTOMER JWT → 200, forwards the cancel; rejects a non-uuid id with 400', async () => {
    setupActiveGuardMock(httpService);
    backendHttpService.delete.mockResolvedValueOnce({ id: ALERT_ID, status: 'CANCELLED' });

    const ok = await request(app.getHttpServer())
      .delete(`/v1/availability-alerts/${ALERT_ID}`)
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
    const bad = await request(app.getHttpServer())
      .delete('/v1/availability-alerts/not-a-uuid')
      .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);

    expect(ok.status).toBe(200);
    expect(backendHttpService.delete).toHaveBeenCalledWith(`/availability-alerts/${ALERT_ID}`);
    expect(bad.status).toBe(400);
  });
});
