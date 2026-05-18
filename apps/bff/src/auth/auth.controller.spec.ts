import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { AuthController } from './auth.controller';
import { JwtIssuerService } from './jwt-issuer.service';
import { SelectionTokenService } from './selection-token.service';
import { GoogleProfile } from './strategies/google.strategy';

// Proper RFC 4122 UUIDs (v4 format: segment-3 starts with 4, segment-4 starts with [89ab])
const TENANT_ID_A = '10000000-0000-4000-8000-000000000001';
const TENANT_ID_B = '10000000-0000-4000-8000-000000000002';
const TENANT_ID_OTHER = '10000000-0000-4000-8000-000000000099';
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001';
const CUSTOMER_ID_B = '20000000-0000-4000-8000-000000000002';

const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  }) as unknown as BackendHttpService;

const makeRes = (): jest.Mocked<Response> =>
  ({ redirect: jest.fn(), cookie: jest.fn() }) as unknown as jest.Mocked<Response>;

describe('AuthController', () => {
  const jwtSecret = 'test-secret-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  let jwtService: JwtService;
  let jwtIssuer: JwtIssuerService;
  let selectionTokenService: SelectionTokenService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: jwtSecret, signOptions: { expiresIn: '7d' } });
    jwtIssuer = new JwtIssuerService(jwtService);
    selectionTokenService = new SelectionTokenService(jwtService);
    process.env['FRONTEND_URL'] = 'http://localhost:3000';
    process.env['JWT_EXPIRES_IN'] = '7d';
  });

  afterEach(() => {
    delete process.env['FRONTEND_URL'];
    delete process.env['JWT_EXPIRES_IN'];
  });

  const profile: GoogleProfile = {
    googleOAuthId: 'google-sub-123',
    email: 'joao@lavacar.com.br',
    name: 'João Silva',
  };

  const makeReq = (user: GoogleProfile): Request => ({ user }) as unknown as Request;

  describe('handleGoogleCallback() — tenant-aware path (tenantSlug in OAuth state)', () => {
    const profileWithSlug: GoogleProfile = {
      ...profile,
      tenantSlug: 'lavacar-bh',
    };

    it('issues JWT cookie and redirects to /dashboard on first customer login', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: true }),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profileWithSlug), res);

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/internal/customers',
        expect.objectContaining({
          tenantId: TENANT_ID_A,
          googleOAuthId: profile.googleOAuthId,
        }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('JWT payload has correct sub=customerId and tenantSlug', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: true }),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profileWithSlug), res);

      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(CUSTOMER_ID_A);
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
      expect(decoded['role']).toBe('CUSTOMER');
    });

    it('redirects to /auth/error?reason=tenant-not-found when slug is unknown', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new Error('not found')),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profileWithSlug), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=tenant-not-found',
      );
    });
  });

  describe('handleGoogleCallback() — multi-tenant path (no tenantSlug)', () => {
    it('redirects to /auth/error when no tenant is found', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue([]) });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=no-tenant',
      );
    });

    it('issues a JWT cookie and redirects to /dashboard for a single-tenant customer', async () => {
      const tenantId = TENANT_ID_A;
      const customerId = CUSTOMER_ID_A;
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId, customerId }])
          .mockResolvedValueOnce({ id: tenantId, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('JWT cookie payload has correct sub=customerId and role=CUSTOMER', async () => {
      const tenantId = TENANT_ID_A;
      const customerId = CUSTOMER_ID_A;
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId, customerId }])
          .mockResolvedValueOnce({ id: tenantId, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(customerId);
      expect(decoded['role']).toBe('CUSTOMER');
      expect(decoded['tenantId']).toBe(tenantId);
    });

    it('redirects to /select-tenant with a selection token for multi-tenant customers', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([
          { tenantId: TENANT_ID_A, customerId: 'cid-1' },
          { tenantId: TENANT_ID_B, customerId: 'cid-2' },
        ]),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/select-tenant\?token=.+/),
      );
    });
  });

  describe('issueToken()', () => {
    it('returns 400 for a missing selectionToken', async () => {
      const controller = new AuthController(jwtIssuer, selectionTokenService, makeBackendHttp());

      await expect(
        controller.issueToken({ tenantId: TENANT_ID_A }, {} as Request),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 for a non-UUID tenantId', async () => {
      const controller = new AuthController(jwtIssuer, selectionTokenService, makeBackendHttp());

      await expect(
        controller.issueToken({ selectionToken: 'tok', tenantId: 'not-a-uuid' }, {} as Request),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 when the selection token is expired or invalid', async () => {
      const controller = new AuthController(jwtIssuer, selectionTokenService, makeBackendHttp());

      await expect(
        controller.issueToken(
          { selectionToken: 'bad.token.here', tenantId: TENANT_ID_A },
          {} as Request,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 403 when the customer has no record in the requested tenant', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([{ tenantId: TENANT_ID_A, customerId: 'cid-1' }]),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);

      await expect(
        controller.issueToken({ selectionToken, tenantId: TENANT_ID_OTHER }, {} as Request),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns { accessToken, expiresIn } with correct JWT payload on success', async () => {
      const tenantId = TENANT_ID_A;
      const customerId = CUSTOMER_ID_B;
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId, customerId }])
          .mockResolvedValueOnce({ id: tenantId, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const controller = new AuthController(jwtIssuer, selectionTokenService, backendHttp);

      const result = await controller.issueToken({ selectionToken, tenantId }, {} as Request);

      expect(result.accessToken).toBeTruthy();
      expect(result.expiresIn).toBe('7d');
      const decoded = jwtService.decode(result.accessToken) as Record<string, unknown>;
      expect(decoded['sub']).toBe(customerId);
      expect(decoded['role']).toBe('CUSTOMER');
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
    });
  });
});
