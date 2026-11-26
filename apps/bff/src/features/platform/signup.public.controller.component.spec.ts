import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SignupPublicController } from './signup.public.controller';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

describe('SignupPublicController (component)', () => {
  let app: INestApplication;
  let backendHttpService: MockBackendHttpService;
  let jwtService: JwtService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, backendHttpService, jwtService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /v1/public/signup/slug-availability (public)', () => {
    it.each([
      [{ status: 'available' }],
      [{ status: 'taken' }],
      [{ status: 'reserved' }],
      [{ status: 'invalid', reason: 'TOO_SHORT' }],
    ])('forwards the backend verdict %j without a JWT', async (verdict) => {
      backendHttpService.get.mockResolvedValueOnce(verdict);

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual(verdict);
      expect(backendHttpService.get).toHaveBeenCalledWith('/internal/signup/slug-availability', {
        slug: 'lavacar-top',
      });
    });

    it('is never cached, so a stale "available" cannot be served', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'available' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('returns only a status (and a reason), never a tenant field', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'taken' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(Object.keys(res.body)).toEqual(['status']);
    });

    it('rejects a request without the slug parameter with 400, before the backend', async () => {
      const res = await request(app.getHttpServer()).get('/v1/public/signup/slug-availability');

      expect(res.status).toBe(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('leaves length and character rules to the backend: a one-letter slug is forwarded', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'invalid', reason: 'TOO_SHORT' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=a',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'invalid', reason: 'TOO_SHORT' });
    });

    it('passes a backend failure through instead of answering a wrong verdict', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Service Unavailable', status: 503 }, 503),
      );

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.status).toBe(503);
    });

    // AppThrottlerGuard skips every environment but staging and production (APP_ENV defaults to
    // local), so a request loop cannot reach a 429 here; the declaration is what is pinned.
    it('declares the 30 requests per minute per IP throttle', () => {
      const handler = SignupPublicController.prototype.getSlugAvailability;

      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    });
  });

  // The signup session cookie, signed the way SignupSessionService signs it.
  function signupCookie(overrides: Record<string, unknown> = {}): string {
    const token = jwtService.sign(
      {
        typ: 'signup-session',
        email: 'dona@gmail.com',
        name: 'Dona',
        googleSub: 'sub-123',
        ...overrides,
      },
      { audience: 'signup-session', expiresIn: '30m' },
    );
    return `signup_session=${token}`;
  }

  const BODY = {
    businessName: 'Lava Car Top',
    slug: 'lavacar-top',
    countryCode: 'BR',
    taxId: '529.982.247-25',
    acceptedTermsVersion: '2026-11',
    turnstileToken: 'token-1',
  };

  describe('GET /v1/public/signup/session', () => {
    it('answers 401 without a signup cookie, and calls no backend', async () => {
      const res = await request(app.getHttpServer()).get('/v1/public/signup/session');

      expect(res.status).toBe(401);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('answers the identity and the trial answer for a valid cookie, uncached', async () => {
      backendHttpService.get.mockResolvedValueOnce({
        trialAvailable: true,
        existingTenantSlug: null,
        termsVersion: '2026-11',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/public/signup/session')
        .set('Cookie', signupCookie());

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        email: 'dona@gmail.com',
        name: 'Dona',
        trialAvailable: true,
        termsVersion: '2026-11',
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('rejects a session JWT presented as the signup cookie', async () => {
      const sessionJwt = jwtService.sign({
        sub: 'staff-1',
        tenantId: 't-1',
        tenantSlug: 'lava',
        role: 'MANAGER',
      });

      const res = await request(app.getHttpServer())
        .get('/v1/public/signup/session')
        .set('Cookie', `signup_session=${sessionJwt}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /v1/public/signup/tenant', () => {
    it('creates the tenant, clears the signup cookie and sets the resend credential, with no tenant JWT', async () => {
      backendHttpService.postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          registrationId: '0198aaaa-0000-7000-8000-000000000001',
          trialAvailable: true,
        })
        .mockResolvedValueOnce({ tenantId: 'tenant-1', slug: 'lavacar-top', name: 'Lava Car Top' });

      const res = await request(app.getHttpServer())
        .post('/v1/public/signup/tenant')
        .set('Cookie', signupCookie())
        .send(BODY);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        tenantSlug: 'lavacar-top',
        nextPath: '/ikaro-trial/conta-criada',
      });
      const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(setCookie).toContain('signup_resend=');
      expect(setCookie).toMatch(/signup_session=;/);
      expect(setCookie).not.toContain('access_token');
    });

    it('takes the email and name from the session, never from the body', async () => {
      backendHttpService.postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          registrationId: '0198aaaa-0000-7000-8000-000000000001',
          trialAvailable: true,
        })
        .mockResolvedValueOnce({ tenantId: 'tenant-1', slug: 'lavacar-top', name: 'x' });

      await request(app.getHttpServer())
        .post('/v1/public/signup/tenant')
        .set('Cookie', signupCookie())
        .send({ ...BODY, email: 'attacker@evil.com', name: 'Evil' });

      expect(backendHttpService.postWithoutTenant.mock.calls[2][1]).toMatchObject({
        adminEmail: 'dona@gmail.com',
      });
    });

    it('answers 401 without a signup cookie, calling no backend', async () => {
      const res = await request(app.getHttpServer()).post('/v1/public/signup/tenant').send(BODY);

      expect(res.status).toBe(401);
      expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
    });

    it('answers 400 for a missing Turnstile token, before any backend call', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/signup/tenant')
        .set('Cookie', signupCookie())
        .send({ ...BODY, turnstileToken: '' });

      expect(res.status).toBe(400);
      expect(backendHttpService.postWithoutTenant).not.toHaveBeenCalled();
    });

    it('maps a refused trial to 409 SIGNUP_TRIAL_NOT_AVAILABLE and keeps the signup cookie', async () => {
      backendHttpService.postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ registrationId: null, trialAvailable: false });

      const res = await request(app.getHttpServer())
        .post('/v1/public/signup/tenant')
        .set('Cookie', signupCookie())
        .send(BODY);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('SIGNUP_TRIAL_NOT_AVAILABLE');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    // AppThrottlerGuard skips every environment but staging and production, so a request loop
    // cannot reach a 429 here; the declaration is what is pinned (observed once on staging).
    it('declares the 10 per minute burst throttle and its own error code', () => {
      const handler = SignupPublicController.prototype.createTenant;

      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(10);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    });
  });
});
