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
import { DayGridResponse } from './schedule.types';

const RESOURCE_ID = '30000000-0000-4000-8000-000000000003';

const mockResponse: DayGridResponse = {
  date: '2026-06-01',
  columns: [{ resourceId: RESOURCE_ID, name: 'Estúdio 1', type: 'ROOM', blocks: [] }],
};

describe('ScheduleDayGridController (component)', () => {
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

  // ─── GET /v1/schedule/day-grid ──────────────────────────────────────────────

  describe('GET /v1/schedule/day-grid', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/schedule/day-grid?date=2026-06-01');
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF role (MANAGER-only)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/day-grid?date=2026-06-01')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/day-grid?date=2026-06-01')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 400 when date param is malformed (Zod validation)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/schedule/day-grid?date=not-a-date')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls GET /schedule/day-grid on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/schedule/day-grid?date=2026-06-01')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith('/schedule/day-grid', {
        date: '2026-06-01',
      });
    });
  });
});
