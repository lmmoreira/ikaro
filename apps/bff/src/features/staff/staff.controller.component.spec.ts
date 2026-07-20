import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AxiosError } from 'axios';
import jsonwebtoken from 'jsonwebtoken';
import {
  STAFF_ID,
  STAFF_ID_2,
  TENANT_ID,
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  makeObservableError,
  setupActiveGuardMock,
  request,
} from '../../test/component-test.helpers';

const EMPTY_LIST = {
  items: [],
  pagination: { limit: 50, offset: 0, total: 0, hasMore: false, nextOffset: null },
};

describe('StaffController (component)', () => {
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
    // resetAllMocks clears both call history and mockReturnValueOnce queues,
    // preventing leaked mock state between tests.
    jest.resetAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group A — Authentication gate (JwtAuthGuard)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('GET /v1/staff → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/staff');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ status: 401 });
    });

    it('GET /v1/staff → 401 with a malformed token', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });

    it('GET /v1/staff → 401 with a token signed by the wrong secret', async () => {
      const wrongJwt = jsonwebtoken.sign(
        { sub: STAFF_ID, tenantId: TENANT_ID, tenantSlug: 'bh', role: 'MANAGER' },
        'wrong-secret',
      );
      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${wrongJwt}`);
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group B — Role gate (RolesGuard)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('role enforcement', () => {
    it('GET /v1/staff → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('GET /v1/staff → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('POST /v1/staff/invite → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'STAFF' });
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/staff/:id → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ name: 'Nome', role: 'STAFF' });
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/staff/:id/activate → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}/activate`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('GET /v1/staff/me → not 403 for STAFF role (unlike GET /v1/staff, this route is staff-inclusive)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({
        id: STAFF_ID,
        email: 'a@b.com',
        name: 'A',
        role: 'STAFF',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/staff/me')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group C — ActiveStaffGuard
  // ActiveStaffGuard uses HttpService directly (not BackendHttpService).
  // httpService mock assertions verify buildBackendHeaders() header propagation.
  // ─────────────────────────────────────────────────────────────────────────────

  describe('ActiveStaffGuard', () => {
    it('blocks with 403 when backend reports isActive=false', async () => {
      setupActiveGuardMock(httpService, false);

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ status: 403, detail: 'Your account has been deactivated' });
    });

    it('fails closed (401) when backend returns 404 — no hard-delete path exists for staff, so a 404 on the caller’s own id means a stale/mismatched JWT', async () => {
      const err = new AxiosError();
      err.response = { status: 404, data: {} } as never;
      httpService.get.mockReturnValueOnce(makeObservableError(err));

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(401);
    });

    it('returns 503 when backend is unreachable for the guard check', async () => {
      httpService.get.mockReturnValueOnce(makeObservableError(new AxiosError('ECONNREFUSED')));

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(503);
    });

    it('preserves the backend’s real code/detail for a non-404 backend error instead of substituting a generic message', async () => {
      const backendBody = {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        code: 'PLATFORM_TENANT_INACTIVE',
        detail: 'This business is inactive.',
      };
      const err = new AxiosError();
      err.response = { status: 400, data: backendBody } as never;
      httpService.get.mockReturnValueOnce(makeObservableError(err));

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject(backendBody);
    });

    it('sends X-Tenant-ID, X-Actor-ID, X-Actor-Type, X-Actor-Role to the backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(EMPTY_LIST);

      await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      const [guardUrl, guardOpts] = (httpService.get as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(guardUrl).toContain('/staff/me/status');
      expect(guardOpts.headers['X-Tenant-ID']).toBe(TENANT_ID);
      expect(guardOpts.headers['X-Actor-ID']).toBe(STAFF_ID);
      expect(guardOpts.headers['X-Actor-Type']).toBe('STAFF');
      expect(guardOpts.headers['X-Actor-Role']).toBe('MANAGER');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group D — Input validation (ZodValidationPipe + NestJS pipes)
  // Guards run first, then pipes — setupActiveGuardMock is required for MANAGER JWT.
  // ─────────────────────────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('POST /v1/staff/invite → 400 when email is missing', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ firstName: 'A', lastName: 'B', role: 'STAFF' });
      expect(res.status).toBe(400);
    });

    it('POST /v1/staff/invite → 400 when email format is invalid', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ email: 'not-an-email', firstName: 'A', lastName: 'B', role: 'STAFF' });
      expect(res.status).toBe(400);
    });

    it('POST /v1/staff/invite → 400 when role is not MANAGER or STAFF', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'SUPERADMIN' });
      expect(res.status).toBe(400);
    });

    it('GET /v1/staff/:id → 400 when id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/staff/not-a-uuid')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('PATCH /v1/staff/:id/deactivate → 400 when id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch('/v1/staff/not-a-uuid/deactivate')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('PATCH /v1/staff/:id/activate → 400 when id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch('/v1/staff/not-a-uuid/activate')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });

    it('PATCH /v1/staff/:id → 400 when id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch('/v1/staff/not-a-uuid')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'Nome', role: 'STAFF' });
      expect(res.status).toBe(400);
    });

    it('PATCH /v1/staff/:id → 400 when name is missing', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ role: 'STAFF' });
      expect(res.status).toBe(400);
    });

    it('PATCH /v1/staff/:id → 400 when role is not MANAGER or STAFF', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'Nome', role: 'SUPERADMIN' });
      expect(res.status).toBe(400);
    });

    it('GET /v1/staff → 400 when limit is not a number', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/staff?limit=notanumber')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group E — Happy paths
  // ─────────────────────────────────────────────────────────────────────────────

  describe('happy paths', () => {
    it('GET /v1/staff calls GET /staff with correct params, derives status and strips googleOAuthId', async () => {
      const backendResponse = {
        items: [
          {
            id: STAFF_ID,
            email: 'a@b.com',
            name: 'A',
            role: 'MANAGER',
            isActive: true,
            googleOAuthId: 'google-sub-1',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        pagination: { limit: 10, offset: 5, total: 1, hasMore: false, nextOffset: null },
      };
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(backendResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/staff?limit=10&offset=5')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [
          {
            id: STAFF_ID,
            email: 'a@b.com',
            name: 'A',
            role: 'MANAGER',
            isActive: true,
            createdAt: '2026-01-01T00:00:00Z',
            status: 'ACTIVE',
          },
        ],
        pagination: backendResponse.pagination,
      });
      expect(backendHttpService.get).toHaveBeenCalledWith('/staff', { limit: 10, offset: 5 });
    });

    it('GET /v1/staff/me calls GET /staff/:id with the id from the JWT sub (not a route param)', async () => {
      const staffMember = {
        id: STAFF_ID,
        email: 'gerente@lavacar.com.br',
        name: 'Gerente Silva',
        role: 'MANAGER',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      };
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(staffMember);

      const res = await request(app.getHttpServer())
        .get('/v1/staff/me')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(staffMember);
      expect(backendHttpService.get).toHaveBeenCalledWith(`/staff/${STAFF_ID}`);
    });

    it('GET /v1/staff/:id calls GET /staff/:id on backend', async () => {
      const staffMember = {
        id: STAFF_ID_2,
        email: 'b@b.com',
        name: 'B',
        role: 'STAFF',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      };
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(staffMember);

      const res = await request(app.getHttpServer())
        .get(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(staffMember);
      expect(backendHttpService.get).toHaveBeenCalledWith(`/staff/${STAFF_ID_2}`);
    });

    it('POST /v1/staff/invite calls POST /staff/invite with exact body', async () => {
      const inviteBody = {
        email: 'novo@lavacar.com.br',
        firstName: 'João',
        lastName: 'Silva',
        role: 'STAFF',
      };
      const backendResponse = {
        staffId: STAFF_ID_2,
        email: inviteBody.email,
        role: 'STAFF',
        isActive: false,
      };
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(backendResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(inviteBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(backendResponse);
      expect(backendHttpService.post).toHaveBeenCalledWith('/staff/invite', inviteBody);
    });

    it('PATCH /v1/staff/:id/deactivate calls PATCH /staff/:id/deactivate', async () => {
      const backendResponse = { staffId: STAFF_ID_2, isActive: false };
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(backendResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}/deactivate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(backendResponse);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/staff/${STAFF_ID_2}/deactivate`, {});
    });

    it('PATCH /v1/staff/:id/activate calls PATCH /staff/:id/activate', async () => {
      const backendResponse = { staffId: STAFF_ID_2, isActive: true };
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(backendResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}/activate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(backendResponse);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/staff/${STAFF_ID_2}/activate`, {});
    });

    it('PATCH /v1/staff/:id calls PATCH /staff/:id with exact body', async () => {
      const updateBody = { name: 'Nome Editado', role: 'MANAGER' };
      const backendResponse = { staffId: STAFF_ID_2, name: 'Nome Editado', role: 'MANAGER' };
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(backendResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(updateBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(backendResponse);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/staff/${STAFF_ID_2}`, updateBody);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group F — Backend error propagation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('backend error propagation', () => {
    it('propagates 404 from backend as-is', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });

    it('propagates 409 from backend on invite conflict', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ title: 'Conflict', status: 409 }, 409),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/staff/invite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ email: 'existing@lavacar.com.br', firstName: 'X', lastName: 'Y', role: 'STAFF' });

      expect(res.status).toBe(409);
    });

    it('propagates 409 from backend when demoting the last active manager', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ title: 'Conflict', status: 409 }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'Nome', role: 'STAFF' });

      expect(res.status).toBe(409);
    });

    it('propagates 409 from backend when activating an already-active member', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ title: 'Conflict', status: 409 }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/staff/${STAFF_ID_2}/activate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(409);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group G — Infrastructure (interceptors)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('infrastructure', () => {
    it('CorrelationMiddleware adds X-Correlation-ID to the response', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(EMPTY_LIST);

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.headers['x-correlation-id']).toBeDefined();
    });

    it('forwards an incoming X-Correlation-ID to the guard backend call', async () => {
      // Must be a well-formed UUIDv7 — CorrelationMiddleware (M17-S31 review, 2026-07-20)
      // replaces anything else with a freshly generated id rather than trusting it.
      const correlationId = '01888888-0000-7000-8000-000000000001';
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(EMPTY_LIST);

      await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .set('X-Correlation-ID', correlationId);

      const [, guardOpts] = (httpService.get as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(guardOpts.headers['X-Correlation-ID']).toBe(correlationId);
    });

    it('ErrorFilter converts unhandled errors to 500 with RFC 7807 body', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(new Error('unexpected'));

      const res = await request(app.getHttpServer())
        .get('/v1/staff')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
      });
    });

    it('every non-2xx response is Content-Type: application/problem+json (RFC 9457)', async () => {
      const res = await request(app.getHttpServer()).get('/v1/staff');

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it("normalizes Nest's own framework-thrown 404 (unmatched route) into a real ProblemDetail", async () => {
      // No controller/handler matches this path at all — Nest's router throws its own
      // { statusCode, message, error } shaped 404 before any Guard or our code runs.
      // Confirmed via M17-S31 review (2026-07-20): the filter must normalize this, not just
      // stamp Content-Type: application/problem+json on a body that was never RFC
      // 9457-shaped.
      const res = await request(app.getHttpServer()).get('/v1/this-route-does-not-exist');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ type: 'about:blank', title: 'Not Found', status: 404 });
      expect(res.body).toHaveProperty('detail');
      expect(res.body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    });

    // M17-S31 root-cause regression: JwtAuthGuard runs before any Interceptor in NestJS's
    // pipeline. The former CorrelationInterceptor never ran for a request it rejected, so a
    // 401 shipped with no correlation id at all, in header or body — this proves the
    // CorrelationMiddleware fix closes that gap on the actual production AppModule wiring.
    it('a request JwtAuthGuard rejects still carries a correlationId, in both the header and the body', async () => {
      const res = await request(app.getHttpServer()).get('/v1/staff');

      expect(res.status).toBe(401);
      expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
    });

    it('an unhandled error in production mode returns a generic 500 with no stack trace', async () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        setupActiveGuardMock(httpService);
        backendHttpService.get.mockRejectedValueOnce(
          new Error('unexpected\n    at someInternalFn (/app/dist/x.js:42:1)'),
        );

        const res = await request(app.getHttpServer())
          .get('/v1/staff')
          .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

        expect(res.status).toBe(500);
        expect(res.body.detail).toBe('An unexpected error occurred');
        expect(JSON.stringify(res.body)).not.toContain('someInternalFn');
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });
  });
});
