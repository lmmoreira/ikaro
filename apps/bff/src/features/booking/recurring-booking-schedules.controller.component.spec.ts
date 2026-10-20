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
} from '../../test/component-test.helpers';

const SCHEDULE_ID = '50000000-0000-4000-8000-000000000020';
const SERVICE_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000002';
const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000002';

const BASE = '/v1/recurring-booking-schedules';

const validCreateBody = {
  serviceId: SERVICE_ID,
  recurrence: {
    frequency: 'WEEKLY',
    daysOfWeek: ['monday', 'thursday'],
    startTime: '09:00',
    durationMinutes: 60,
  },
  startsOn: '2026-12-01',
  endsOn: '2027-02-28',
};

const mockListResponse = { items: [], total: 0 };
const mockListItem = { id: SCHEDULE_ID, status: 'ACTIVE' };
const mockCreateResponse = { id: SCHEDULE_ID, status: 'ACTIVE', approvalHoldExpiresAt: null };
const mockEndResponse = { id: SCHEDULE_ID, status: 'CANCELLED', cancelledBookingIds: [] };
const mockApproveResponse = { id: SCHEDULE_ID, status: 'ACTIVE' };
const mockRejectResponse = { id: SCHEDULE_ID, status: 'CANCELLED' };

describe('RecurringBookingSchedulesController (component)', () => {
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

  // CUSTOMER carries no ActiveStaffGuard lookup; STAFF and MANAGER need it mocked per request.
  const callers: ReadonlyArray<readonly [string, (jwt: JwtService) => string, boolean]> = [
    ['CUSTOMER', (jwt) => makeCustomerJwt(jwt), false],
    ['STAFF', (jwt) => makeStaffJwt(jwt), true],
    ['MANAGER', (jwt) => makeManagerJwt(jwt), true],
  ];

  function bearer(makeJwt: (jwt: JwtService) => string, needsGuard: boolean): string {
    if (needsGuard) setupActiveGuardMock(httpService);
    return `Bearer ${makeJwt(jwtService)}`;
  }

  describe('GET /v1/recurring-booking-schedules', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(BASE);
      expect(res.status).toBe(401);
    });

    it.each(callers)(
      '%s JWT → 200, returns the backend response unchanged',
      async (_role, makeJwt, needsGuard) => {
        backendHttpService.get.mockResolvedValueOnce(mockListResponse);

        const res = await request(app.getHttpServer())
          .get(`${BASE}?status=ACTIVE&limit=10&offset=5`)
          .set('Authorization', bearer(makeJwt, needsGuard));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockListResponse);
        expect(backendHttpService.get).toHaveBeenCalledWith('/recurring-booking-schedules', {
          status: 'ACTIVE',
          limit: 10,
          offset: 5,
        });
      },
    );

    it('applies the default pagination when no query is sent', async () => {
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      await request(app.getHttpServer())
        .get(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );

      expect(backendHttpService.get).toHaveBeenCalledWith('/recurring-booking-schedules', {
        limit: 25,
        offset: 0,
      });
    });

    it('returns 400 for an unknown status filter (Zod)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?status=NOPE`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );
      expect(res.status).toBe(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('returns 400 when limit is above 100 (Zod)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?limit=101`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );
      expect(res.status).toBe(400);
    });

    it('propagates a backend 5xx as 500', async () => {
      backendHttpService.get.mockRejectedValueOnce(new HttpException('Internal Server Error', 500));

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );

      expect(res.status).toBe(500);
    });
  });

  describe('GET /v1/recurring-booking-schedules/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(`${BASE}/${SCHEDULE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 400 when :id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/not-a-uuid`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );
      expect(res.status).toBe(400);
    });

    it.each(callers)(
      '%s JWT → 200, returns the backend response unchanged',
      async (_role, makeJwt, needsGuard) => {
        backendHttpService.get.mockResolvedValueOnce(mockListItem);

        const res = await request(app.getHttpServer())
          .get(`${BASE}/${SCHEDULE_ID}`)
          .set('Authorization', bearer(makeJwt, needsGuard));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockListItem);
        expect(backendHttpService.get).toHaveBeenCalledWith(
          `/recurring-booking-schedules/${SCHEDULE_ID}`,
        );
      },
    );

    it('propagates a backend 404 (cross-tenant, another customer, or missing schedule)', async () => {
      backendHttpService.get.mockRejectedValueOnce(new HttpException('Not Found', 404));

      const res = await request(app.getHttpServer())
        .get(`${BASE}/${SCHEDULE_ID}`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/recurring-booking-schedules', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post(BASE).send(validCreateBody);
      expect(res.status).toBe(401);
    });

    it.each(callers)(
      '%s JWT → 201, returns the backend response unchanged',
      async (_role, makeJwt, needsGuard) => {
        backendHttpService.post.mockResolvedValueOnce(mockCreateResponse);

        const res = await request(app.getHttpServer())
          .post(BASE)
          .set('Authorization', bearer(makeJwt, needsGuard))
          .send(validCreateBody);

        expect(res.status).toBe(201);
        expect(res.body).toEqual(mockCreateResponse);
        expect(backendHttpService.post).toHaveBeenCalledWith(
          '/recurring-booking-schedules',
          validCreateBody,
        );
      },
    );

    it('forwards customerId for a staff-on-behalf request, and nothing else it does not own', async () => {
      backendHttpService.post.mockResolvedValueOnce(mockCreateResponse);

      await request(app.getHttpServer())
        .post(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeStaffJwt(jwt), true),
        )
        .send({ ...validCreateBody, customerId: OTHER_CUSTOMER_ID, tenantId: OTHER_TENANT_ID });

      expect(backendHttpService.post).toHaveBeenCalledWith('/recurring-booking-schedules', {
        ...validCreateBody,
        customerId: OTHER_CUSTOMER_ID,
      });
    });

    it('does not forward a tenantId sent in the body', async () => {
      backendHttpService.post.mockResolvedValueOnce(mockCreateResponse);

      await request(app.getHttpServer())
        .post(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        )
        .send({ ...validCreateBody, tenantId: OTHER_TENANT_ID });

      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/recurring-booking-schedules',
        validCreateBody,
      );
    });

    it.each([
      ['serviceId is not a UUID', { ...validCreateBody, serviceId: 'nope' }],
      ['endsOn is missing', { ...validCreateBody, endsOn: undefined }],
      [
        'daysOfWeek is empty',
        { ...validCreateBody, recurrence: { ...validCreateBody.recurrence, daysOfWeek: [] } },
      ],
      [
        'frequency is not WEEKLY',
        { ...validCreateBody, recurrence: { ...validCreateBody.recurrence, frequency: 'DAILY' } },
      ],
    ])('returns 400 when %s (Zod)', async (_label, body) => {
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        )
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Request validation failed',
      });
      expect(res.body.violations.length).toBeGreaterThan(0);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('propagates a backend 409 conflict', async () => {
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ status: 409, detail: 'conflict' }, 409),
      );

      const res = await request(app.getHttpServer())
        .post(BASE)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        )
        .send(validCreateBody);

      expect(res.status).toBe(409);
    });
  });

  describe('POST /v1/recurring-booking-schedules/:id/end', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post(`${BASE}/${SCHEDULE_ID}/end`);
      expect(res.status).toBe(401);
    });

    it('returns 400 when :id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/not-a-uuid/end`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );
      expect(res.status).toBe(400);
    });

    it.each(callers)(
      '%s JWT → 200, returns the backend response unchanged',
      async (_role, makeJwt, needsGuard) => {
        backendHttpService.post.mockResolvedValueOnce(mockEndResponse);

        const res = await request(app.getHttpServer())
          .post(`${BASE}/${SCHEDULE_ID}/end`)
          .set('Authorization', bearer(makeJwt, needsGuard));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockEndResponse);
        expect(backendHttpService.post).toHaveBeenCalledWith(
          `/recurring-booking-schedules/${SCHEDULE_ID}/end`,
          {},
        );
      },
    );

    it('propagates a backend 5xx as 500', async () => {
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException('Internal Server Error', 500),
      );

      const res = await request(app.getHttpServer())
        .post(`${BASE}/${SCHEDULE_ID}/end`)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );

      expect(res.status).toBe(500);
    });
  });

  describe.each([
    ['approve', mockApproveResponse],
    ['reject', mockRejectResponse],
  ])('POST /v1/recurring-booking-schedules/:id/%s', (action, mockResponse) => {
    const path = `${BASE}/${SCHEDULE_ID}/${action}`;

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post(path);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post(path)
        .set(
          'Authorization',
          bearer((jwt) => makeCustomerJwt(jwt), false),
        );
      expect(res.status).toBe(403);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('returns 400 when :id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/not-a-uuid/${action}`)
        .set(
          'Authorization',
          bearer((jwt) => makeManagerJwt(jwt), true),
        );
      expect(res.status).toBe(400);
    });

    it.each(callers.filter(([role]) => role !== 'CUSTOMER'))(
      `%s JWT → 200, calls POST /recurring-booking-schedules/:id/${action} on the backend`,
      async (_role, makeJwt, needsGuard) => {
        backendHttpService.post.mockResolvedValueOnce(mockResponse);

        const res = await request(app.getHttpServer())
          .post(path)
          .set('Authorization', bearer(makeJwt, needsGuard));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockResponse);
        expect(backendHttpService.post).toHaveBeenCalledWith(
          `/recurring-booking-schedules/${SCHEDULE_ID}/${action}`,
          {},
        );
      },
    );

    it('propagates a backend 422 (schedule is not pending approval)', async () => {
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .post(path)
        .set(
          'Authorization',
          bearer((jwt) => makeManagerJwt(jwt), true),
        );

      expect(res.status).toBe(422);
    });
  });
});
