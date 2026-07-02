import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  CUSTOMER_ID,
  STAFF_ID,
  TENANT_ID,
  TENANT_ID_2,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
} from '../../test/component-test.helpers';

describe('AuthController (component) — non-OAuth routes', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /auth/switch-tenant  (authenticated — CUSTOMER role only)
  // (Login-time multi-tenant selection — POST /v1/auth/token — was removed: no shipped UI
  //  ever reaches it. See docs/04-USE_CASES.md UC-021.)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /v1/auth/switch-tenant', () => {
    it('401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .send({ targetTenantId: TENANT_ID_2 });
      expect(res.status).toBe(401);
    });

    it('403 for MANAGER role (requires CUSTOMER)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ targetTenantId: TENANT_ID_2 });
      expect(res.status).toBe(403);
    });

    it('403 for STAFF role (requires CUSTOMER)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ targetTenantId: TENANT_ID_2 });
      expect(res.status).toBe(403);
    });

    it('400 when targetTenantId is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('403 when customer is not registered in the target tenant', async () => {
      backendHttpService.get.mockResolvedValueOnce([
        { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
      ]);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ targetTenantId: TENANT_ID_2 });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        status: 403,
        detail: 'Customer is not registered in the target tenant',
      });
    });

    it('200 — sets access_token cookie and returns { tenantSlug, expiresIn }', async () => {
      const targetCustomerId = '20000000-0000-4000-8000-000000000002';
      backendHttpService.get
        .mockResolvedValueOnce([
          { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
          { tenantId: TENANT_ID_2, customerId: targetCustomerId },
        ])
        .mockResolvedValueOnce({ id: TENANT_ID_2, slug: 'lavacar-sp', name: 'Lavacar SP' });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ targetTenantId: TENANT_ID_2 });

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.tenantSlug).toBe('lavacar-sp');
      expect(res.body.expiresIn).toBe('7d');
      expect(res.body.accessToken).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /auth/dev-login  (public — dev-only token endpoint)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('POST /v1/auth/dev-login', () => {
    afterEach(() => jest.resetAllMocks());

    it('400 when email is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: 'not-an-email', tenantSlug: 'lavacar-bh', type: 'staff' });
      expect(res.status).toBe(400);
    });

    it('400 when type is not staff or customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: 'admin@lavacar.com.br', tenantSlug: 'lavacar-bh', type: 'admin' });
      expect(res.status).toBe(400);
    });

    it('400 when tenantSlug contains invalid characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: 'admin@lavacar.com.br', tenantSlug: 'Lavacar BH!', type: 'staff' });
      expect(res.status).toBe(400);
    });

    it('400 when email is too long for dev:: prefix (>255 chars total)', async () => {
      backendHttpService.get.mockResolvedValueOnce({
        id: TENANT_ID,
        slug: 'lavacar-bh',
        name: 'Lavacar BH',
      });
      const longEmail = `${'a'.repeat(245)}@x.com`;
      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: longEmail, tenantSlug: 'lavacar-bh', type: 'customer' });
      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('200 — staff path: returns { accessToken, user } with correct role and sets cookie', async () => {
      backendHttpService.get
        .mockResolvedValueOnce({ id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' })
        .mockResolvedValueOnce([
          { staffId: STAFF_ID, tenantId: TENANT_ID, role: 'MANAGER', isActive: true },
        ]);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: 'admin@lavacar.com.br', tenantSlug: 'lavacar-bh', type: 'staff' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('MANAGER');
      expect(res.body.user.sub).toBe(STAFF_ID);
      expect(res.headers['set-cookie']).toBeDefined();

      const decoded = jwtService.verify(res.body.accessToken as string) as Record<string, unknown>;
      expect(decoded['sub']).toBe(STAFF_ID);
      expect(decoded['tenantId']).toBe(TENANT_ID);
      expect(decoded['role']).toBe('MANAGER');
    });

    it('200 — customer path: returns role=CUSTOMER and calls find-or-create with dev:: prefix', async () => {
      backendHttpService.get.mockResolvedValueOnce({
        id: TENANT_ID,
        slug: 'lavacar-bh',
        name: 'Lavacar BH',
      });
      backendHttpService.post.mockResolvedValueOnce({ customerId: CUSTOMER_ID, created: false });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/dev-login')
        .send({ email: 'joao@gmail.com', tenantSlug: 'lavacar-bh', type: 'customer' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('CUSTOMER');
      expect(res.body.user.sub).toBe(CUSTOMER_ID);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/internal/customers',
        expect.objectContaining({ googleOAuthId: 'dev::joao@gmail.com' }),
      );
    });
  });
});
