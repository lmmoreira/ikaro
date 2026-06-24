import { ForbiddenException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { makeBackendHttp } from '../test/backend-http.mock';
import { AuthController } from './auth.controller';
import { DevLoginDto } from './dtos/dev-login.dto';
import { IssueStaffTokenDto } from './dtos/issue-staff-token.dto';
import { IssueTokenDto } from './dtos/issue-token.dto';
import { SwitchTenantDto } from './dtos/switch-tenant.dto';
import { JwtIssuerService } from './jwt-issuer.service';
import { SelectionTokenService } from './selection-token.service';
import { GoogleProfile } from './strategies/google.strategy';

// Proper RFC 4122 UUIDs (v4 format: segment-3 starts with 4, segment-4 starts with [89ab])
const TENANT_ID_A = '10000000-0000-4000-8000-000000000001';
const TENANT_ID_B = '10000000-0000-4000-8000-000000000002';
const TENANT_ID_OTHER = '10000000-0000-4000-8000-000000000099';
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001';
const CUSTOMER_ID_B = '20000000-0000-4000-8000-000000000002';
const STAFF_ID_A = '30000000-0000-4000-8000-000000000001';

const makeRes = (): jest.Mocked<Response> =>
  ({
    redirect: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as unknown as jest.Mocked<Response>;

function makeConfigService(opts?: { enableDevAuth?: string; nodeEnv?: string }): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:3000';
      if (key === 'JWT_EXPIRES_IN') return '7d';
      return undefined;
    }),
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'ENABLE_DEV_AUTH') return opts?.enableDevAuth ?? 'true';
      if (key === 'NODE_ENV') return opts?.nodeEnv ?? 'development';
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('AuthController', () => {
  const jwtSecret = 'test-secret-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  let jwtService: JwtService;
  let jwtIssuer: JwtIssuerService;
  let selectionTokenService: SelectionTokenService;
  let configService: ConfigService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: jwtSecret, signOptions: { expiresIn: '7d' } });
    jwtIssuer = new JwtIssuerService(jwtService);
    selectionTokenService = new SelectionTokenService(jwtService);
    configService = makeConfigService();
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

    it('issues JWT cookie and redirects to /{tenantSlug} on first customer login', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: true }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
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
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/lavacar-bh');
    });

    it('JWT payload has correct sub=customerId and tenantSlug', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: true }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
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
        get: jest.fn().mockRejectedValue(new HttpException('Not Found', 404)),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
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
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=no-tenant',
      );
    });

    it('issues a JWT cookie and redirects to /{tenantSlug} for a single-tenant customer', async () => {
      const tenantId = TENANT_ID_A;
      const customerId = CUSTOMER_ID_A;
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId, customerId }])
          .mockResolvedValueOnce({ id: tenantId, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/lavacar-bh');
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
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
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
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeReq(profile), res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/select-tenant\?token=.+/),
      );
    });
  });

  describe('handleGoogleCallback() — staff first-login path (loginType=staff + tenantSlug)', () => {
    const staffProfileWithSlug = {
      googleOAuthId: 'google-sub-staff-new',
      email: 'gerente@lavacar.com.br',
      name: 'Carlos Gerente',
      loginType: 'staff' as const,
      tenantSlug: 'lavacar-bh',
    };
    const makeStaffFirstLoginReq = () => ({ user: staffProfileWithSlug }) as unknown as Request;

    it('links Google account for an active staff and redirects to /dashboard', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo).mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          email: 'gerente@lavacar.com.br',
          role: 'MANAGER',
          isActive: true,
        }),
        post: jest.fn().mockResolvedValue({
          staffId: STAFF_ID_A,
          tenantId: TENANT_ID_A,
          role: 'MANAGER',
        }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      expect(backendHttp.post).toHaveBeenCalledWith(
        `/internal/staff/${STAFF_ID_A}/link-google`,
        expect.objectContaining({
          tenantId: TENANT_ID_A,
          googleOAuthId: 'google-sub-staff-new',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
        }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('JWT payload has sub=staffId and role=MANAGER after linking', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo).mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          email: 'gerente@lavacar.com.br',
          role: 'MANAGER',
          isActive: true,
        }),
        post: jest
          .fn()
          .mockResolvedValue({ staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER' }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(STAFF_ID_A);
      expect(decoded['role']).toBe('MANAGER');
      expect(decoded['tenantId']).toBe(TENANT_ID_A);
    });

    it('redirects to /auth/error?reason=tenant-not-found when slug is unknown', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new HttpException('Not Found', 404)),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=tenant-not-found',
      );
    });

    it('redirects to /auth/error?reason=invite-not-found when email is not found in tenant', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce(tenantInfo)
          .mockRejectedValueOnce(new HttpException({ status: 404 }, 404)),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=invite-not-found',
      );
    });

    it('redirects to /auth/error?reason=staff-deactivated when staff isActive=false', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo).mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          email: 'gerente@lavacar.com.br',
          role: 'MANAGER',
          isActive: false,
        }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=staff-deactivated',
      );
    });

    it('redirects to /auth/error?reason=email-mismatch when link-google returns 422', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo).mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          email: 'gerente@lavacar.com.br',
          role: 'MANAGER',
          isActive: true,
        }),
        post: jest.fn().mockRejectedValue(new HttpException({ status: 422 }, 422)),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffFirstLoginReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=email-mismatch',
      );
    });
  });

  describe('handleGoogleCallback() — staff login path (loginType=staff)', () => {
    const staffProfile = {
      googleOAuthId: 'google-sub-staff-123',
      email: 'gerente@lavacar.com.br',
      name: 'Carlos Gerente',
      loginType: 'staff' as const,
    };
    const makeStaffReq = () => ({ user: staffProfile }) as unknown as Request;

    it('issues JWT cookie and redirects to /dashboard for a single active MANAGER', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ])
          .mockResolvedValueOnce(tenantInfo),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
    });

    it('JWT payload has sub=staffId and role=MANAGER', async () => {
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ])
          .mockResolvedValueOnce(tenantInfo),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(STAFF_ID_A);
      expect(decoded['role']).toBe('MANAGER');
      expect(decoded['tenantId']).toBe(TENANT_ID_A);
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
    });

    it('JWT payload has role=STAFF for a staff member', async () => {
      const staffId = '30000000-0000-4000-8000-000000000002';
      const tenantInfo = { id: TENANT_ID_B, slug: 'lavacar-centro', name: 'Lavacar Centro' };
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId, tenantId: TENANT_ID_B, role: 'STAFF', isActive: true },
          ])
          .mockResolvedValueOnce(tenantInfo),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['role']).toBe('STAFF');
      expect(decoded['sub']).toBe(staffId);
    });

    it('redirects to /auth/error?reason=not-a-staff-member when array is empty', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=not-a-staff-member',
      );
    });

    it('redirects to /auth/error?reason=staff-deactivated when all matching records are inactive', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValue([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'STAFF', isActive: false },
          ]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=staff-deactivated',
      );
    });

    it('propagates backend errors (e.g. 500) instead of swallowing them', async () => {
      const serverError = new HttpException({ status: 500 }, 500);
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(serverError),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await expect(controller.handleGoogleCallback(makeStaffReq(), res)).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('issues selection token and redirects to /select-staff-tenant when staff has multiple active tenants', async () => {
      const STAFF_ID_B = '30000000-0000-4000-8000-000000000002';
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([
          { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          { staffId: STAFF_ID_B, tenantId: TENANT_ID_B, role: 'STAFF', isActive: true },
        ]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      await controller.handleGoogleCallback(makeStaffReq(), res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/select-staff-tenant\?token=.+/),
      );
    });
  });

  describe('switchTenant()', () => {
    const currentUser: CurrentUserPayload = {
      sub: CUSTOMER_ID_A,
      tenantId: TENANT_ID_A,
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    };

    it('sets cookie + returns { tenantSlug, expiresIn } with correct JWT payload on success', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { tenantId: TENANT_ID_A, customerId: CUSTOMER_ID_A },
            { tenantId: TENANT_ID_B, customerId: CUSTOMER_ID_B },
          ])
          .mockResolvedValueOnce({
            id: TENANT_ID_B,
            slug: 'lavacar-centro',
            name: 'Lavacar Centro',
          }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: SwitchTenantDto = { targetTenantId: TENANT_ID_B };
      const res = makeRes();

      const result = await controller.switchTenant(dto, currentUser, res);

      expect(result.tenantSlug).toBe('lavacar-centro');
      expect(result.expiresIn).toBe('7d');
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['tenantId']).toBe(TENANT_ID_B);
      expect(decoded['tenantSlug']).toBe('lavacar-centro');
      expect(decoded['sub']).toBe(CUSTOMER_ID_B);
      expect(decoded['role']).toBe('CUSTOMER');
    });

    it('returns 403 when customer has no record in the target tenant', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([{ tenantId: TENANT_ID_A, customerId: CUSTOMER_ID_A }]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: SwitchTenantDto = { targetTenantId: TENANT_ID_OTHER };

      await expect(controller.switchTenant(dto, currentUser, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('calls backend with sub and current tenantId for tenant list lookup', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId: TENANT_ID_B, customerId: CUSTOMER_ID_B }])
          .mockResolvedValueOnce({
            id: TENANT_ID_B,
            slug: 'lavacar-centro',
            name: 'Lavacar Centro',
          }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: SwitchTenantDto = { targetTenantId: TENANT_ID_B };

      await controller.switchTenant(dto, currentUser, makeRes());

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/customers/${CUSTOMER_ID_A}/tenants`, {
        tenantId: TENANT_ID_A,
      });
    });
  });

  describe('issueToken()', () => {
    // Schema validation (missing fields, invalid UUID) is handled by ZodValidationPipe at the
    // NestJS layer and is not tested here — it is covered at the integration level.

    it('returns 400 when the selection token is expired or invalid', async () => {
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        makeBackendHttp(),
        configService,
      );
      const dto: IssueTokenDto = { selectionToken: 'bad.token.here', tenantId: TENANT_ID_A };

      await expect(controller.issueToken(dto, makeRes())).rejects.toBeInstanceOf(Error);
    });

    it('returns 403 when the customer has no record in the requested tenant', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([{ tenantId: TENANT_ID_A, customerId: 'cid-1' }]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: IssueTokenDto = { selectionToken, tenantId: TENANT_ID_OTHER };

      await expect(controller.issueToken(dto, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('sets cookie + returns { tenantSlug, expiresIn } with correct JWT payload on success', async () => {
      const tenantId = TENANT_ID_A;
      const customerId = CUSTOMER_ID_B;
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId, customerId }])
          .mockResolvedValueOnce({ id: tenantId, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: IssueTokenDto = { selectionToken, tenantId };
      const res = makeRes();

      const result = await controller.issueToken(dto, res);

      expect(result.tenantSlug).toBe('lavacar-bh');
      expect(result.expiresIn).toBe('7d');
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(customerId);
      expect(decoded['role']).toBe('CUSTOMER');
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
    });
  });

  describe('getStaffTenants()', () => {
    const STAFF_ID_B = '30000000-0000-4000-8000-000000000002';

    it('returns tenant options only for active staff records, resolving each tenant', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
            { staffId: STAFF_ID_B, tenantId: TENANT_ID_B, role: 'STAFF', isActive: true },
            {
              staffId: 'inactive-staff',
              tenantId: TENANT_ID_OTHER,
              role: 'STAFF',
              isActive: false,
            },
          ])
          .mockResolvedValueOnce({ id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' })
          .mockResolvedValueOnce({
            id: TENANT_ID_B,
            slug: 'lavacar-centro',
            name: 'Lavacar Centro',
          }),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );

      const result = await controller.getStaffTenants(selectionToken);

      expect(result).toEqual([
        {
          staffId: STAFF_ID_A,
          tenantId: TENANT_ID_A,
          tenantSlug: 'lavacar-bh',
          tenantName: 'Lavacar BH',
          role: 'MANAGER',
        },
        {
          staffId: STAFF_ID_B,
          tenantId: TENANT_ID_B,
          tenantSlug: 'lavacar-centro',
          tenantName: 'Lavacar Centro',
          role: 'STAFF',
        },
      ]);
      expect(backendHttp.get).toHaveBeenCalledWith('/internal/staff/by-oauth', {
        googleOAuthId: 'google-sub-123',
      });
    });

    it('returns an empty array when the staff has no active tenants', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue([]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );

      const result = await controller.getStaffTenants(selectionToken);

      expect(result).toEqual([]);
    });

    it('rejects when the selection token is invalid', async () => {
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        makeBackendHttp(),
        configService,
      );

      await expect(controller.getStaffTenants('bad.token.here')).rejects.toBeInstanceOf(Error);
    });
  });

  describe('issueStaffToken()', () => {
    it('sets cookie + returns { tenantSlug, expiresIn } with correct JWT payload on success', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ])
          .mockResolvedValueOnce(tenantInfo),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: IssueStaffTokenDto = { selectionToken, staffId: STAFF_ID_A };
      const res = makeRes();

      const result = await controller.issueStaffToken(dto, res);

      expect(result.tenantSlug).toBe('lavacar-bh');
      expect(result.expiresIn).toBe('7d');
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(STAFF_ID_A);
      expect(decoded['role']).toBe('MANAGER');
      expect(decoded['tenantId']).toBe(TENANT_ID_A);
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
    });

    it('returns 403 when the staffId does not match an active record for this account', async () => {
      const selectionToken = selectionTokenService.issueSelectionToken('google-sub-123');
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValue([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: false },
          ]),
      });
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const dto: IssueStaffTokenDto = { selectionToken, staffId: STAFF_ID_A };

      await expect(controller.issueStaffToken(dto, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns 400 when the selection token is expired or invalid', async () => {
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        makeBackendHttp(),
        configService,
      );
      const dto: IssueStaffTokenDto = { selectionToken: 'bad.token.here', staffId: STAFF_ID_A };

      await expect(controller.issueStaffToken(dto, makeRes())).rejects.toBeInstanceOf(Error);
    });
  });

  describe('devLogin()', () => {
    const tenantInfo = { id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' };
    const makeRes = (): jest.Mocked<Response> =>
      ({ cookie: jest.fn() }) as unknown as jest.Mocked<Response>;

    it('throws ForbiddenException when ENABLE_DEV_AUTH is not "true"', async () => {
      const ctrl = new AuthController(
        jwtIssuer,
        selectionTokenService,
        makeBackendHttp(),
        makeConfigService({ enableDevAuth: 'false' }),
      );
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };
      await expect(ctrl.devLogin(dto, makeRes())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException when NODE_ENV is production', async () => {
      const ctrl = new AuthController(
        jwtIssuer,
        selectionTokenService,
        makeBackendHttp(),
        makeConfigService({ nodeEnv: 'production' }),
      );
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };
      await expect(ctrl.devLogin(dto, makeRes())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('staff path: returns accessToken + user with correct role and sets cookie (already linked)', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce(tenantInfo) // GET /internal/tenants/by-slug
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ]), // GET by-oauth → already linked
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const res = makeRes();
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };

      const result = await ctrl.devLogin(dto, res);

      expect(result.accessToken).toBeTruthy();
      expect(result.user.role).toBe('MANAGER');
      expect(result.user.sub).toBe(STAFF_ID_A);
      expect(result.user.tenantId).toBe(TENANT_ID_A);
      expect(result.user.tenantSlug).toBe('lavacar-bh');
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        result.accessToken,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('staff path: not yet linked — looks up by email and links the dev Google account', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce(tenantInfo) // GET /internal/tenants/by-slug
          .mockResolvedValueOnce([]) // GET by-oauth → not yet linked
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'admin@lavacar.com.br',
            role: 'MANAGER',
            isActive: true,
          }), // GET by-email
        post: jest.fn().mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          tenantId: TENANT_ID_A,
          role: 'MANAGER',
        }), // POST link-google
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const res = makeRes();
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };

      const result = await ctrl.devLogin(dto, res);

      expect(backendHttp.post).toHaveBeenCalledWith(
        `/internal/staff/${STAFF_ID_A}/link-google`,
        expect.objectContaining({ googleOAuthId: 'dev::admin@lavacar.com.br' }),
      );
      expect(result.user.sub).toBe(STAFF_ID_A);
      expect(result.user.role).toBe('MANAGER');
    });

    it('staff path: JWT payload has sub=staffId and role from DB', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce(tenantInfo) // GET /internal/tenants/by-slug
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'STAFF', isActive: true },
          ]), // GET by-oauth
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const dto: DevLoginDto = {
        email: 'staff@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };

      const result = await ctrl.devLogin(dto, makeRes());

      const decoded = jwtService.decode(result.accessToken) as Record<string, unknown>;
      expect(decoded['sub']).toBe(STAFF_ID_A);
      expect(decoded['role']).toBe('STAFF');
    });

    it('customer path: returns role=CUSTOMER and calls find-or-create with dev:: prefix', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo),
        post: jest.fn().mockResolvedValueOnce({ customerId: CUSTOMER_ID_A, created: false }),
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const dto: DevLoginDto = {
        email: 'joao@gmail.com',
        tenantSlug: 'lavacar-bh',
        type: 'customer',
      };

      const result = await ctrl.devLogin(dto, makeRes());

      expect(result.user.role).toBe('CUSTOMER');
      expect(result.user.sub).toBe(CUSTOMER_ID_A);
      expect(backendHttp.post).toHaveBeenCalledWith(
        '/internal/customers',
        expect.objectContaining({ googleOAuthId: 'dev::joao@gmail.com' }),
      );
    });

    it('customer path: throws 400 when dev:: + email exceeds 255 chars', async () => {
      const longEmail = `${'a'.repeat(245)}@x.com`; // dev:: + this = 256 chars
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce(tenantInfo),
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const dto: DevLoginDto = { email: longEmail, tenantSlug: 'lavacar-bh', type: 'customer' };

      await expect(ctrl.devLogin(dto, makeRes())).rejects.toMatchObject({ status: 400 });
      expect(backendHttp.post).not.toHaveBeenCalled();
    });

    it('customer path: repeated calls with same email return same customerId (find-or-create)', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: false }),
      });
      const ctrl = new AuthController(jwtIssuer, selectionTokenService, backendHttp, configService);
      const dto: DevLoginDto = {
        email: 'joao@gmail.com',
        tenantSlug: 'lavacar-bh',
        type: 'customer',
      };

      const r1 = await ctrl.devLogin(dto, makeRes());
      const r2 = await ctrl.devLogin(dto, makeRes());

      expect(r1.user.sub).toBe(r2.user.sub);
    });
  });

  describe('logout()', () => {
    it('clears the access_token cookie and redirects to the tenant hotsite when tenantSlug is valid', () => {
      const backendHttp = makeBackendHttp();
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      controller.logout('lavacar-bh', res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/lavacar-bh');
    });

    it('redirects to the bare frontendUrl when tenantSlug is missing', () => {
      const backendHttp = makeBackendHttp();
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      controller.logout(undefined, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('redirects to the bare frontendUrl when tenantSlug fails validation', () => {
      const backendHttp = makeBackendHttp();
      const controller = new AuthController(
        jwtIssuer,
        selectionTokenService,
        backendHttp,
        configService,
      );
      const res = makeRes();

      controller.logout('Not Valid Slug!', res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });
  });
});
