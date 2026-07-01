import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { makeBackendHttp } from '../test/backend-http.mock';
import { CurrentUserPayloadBuilder } from '../test/builders/current-user-payload.builder';
import { AuthControllerFlowService } from './auth-controller-flow.service';
import { DevLoginDto } from './dtos/dev-login.dto';
import { JwtIssuerService } from './jwt-issuer.service';
import { GoogleProfile } from './strategies/google.strategy';
import { SwitchStaffTenantDto } from './dtos/switch-staff-tenant.dto';
import { SwitchTenantDto } from './dtos/switch-tenant.dto';

const TENANT_ID_A = '10000000-0000-4000-8000-000000000001';
const TENANT_ID_B = '10000000-0000-4000-8000-000000000002';
const CUSTOMER_ID_A = '20000000-0000-4000-8000-000000000001';
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

describe('AuthControllerFlowService', () => {
  const jwtSecret = 'test-secret-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  let jwtService: JwtService;
  let jwtIssuer: JwtIssuerService;
  let configService: ConfigService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: jwtSecret, signOptions: { expiresIn: '7d' } });
    jwtIssuer = new JwtIssuerService(jwtService);
    configService = makeConfigService();
  });

  afterEach(() => jest.resetAllMocks());

  const makeService = (
    backendHttp = makeBackendHttp(),
    config = configService,
  ): AuthControllerFlowService => new AuthControllerFlowService(jwtIssuer, backendHttp, config);

  const currentUser = CurrentUserPayloadBuilder.asCustomer()
    .withSub(CUSTOMER_ID_A)
    .withTenantId(TENANT_ID_A)
    .withUserName('João Silva')
    .build();

  const customerProfile: GoogleProfile = {
    googleOAuthId: 'google-sub-123',
    email: 'joao@lavacar.com.br',
    name: 'João Silva',
    tenantSlug: 'lavacar-bh',
  };

  describe('handleGoogleCallback()', () => {
    it('issues a customer token and redirects to the tenant hotsite', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({
          id: TENANT_ID_A,
          slug: 'lavacar-bh',
          name: 'Lavacar BH',
        }),
        post: jest.fn().mockResolvedValue({ customerId: CUSTOMER_ID_A, created: true }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(customerProfile, res);

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/internal/customers',
        expect.objectContaining({
          tenantId: TENANT_ID_A,
          googleOAuthId: customerProfile.googleOAuthId,
        }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/lavacar-bh');
    });

    it('redirects to /auth/error?reason=no-tenant when tenantSlug is missing', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn() });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(backendHttp.get).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=no-tenant',
      );
    });

    it('issues a staff token and redirects to the dashboard', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'gerente@lavacar.com.br',
            role: 'MANAGER',
            isActive: true,
            googleOAuthId: 'google-sub-staff-123',
          }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/dashboard');
      expect(backendHttp.post).not.toHaveBeenCalled();
    });

    it('redirects staff logins to tenant-not-found when the tenant is missing', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValueOnce(new NotFoundException()),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=tenant-not-found',
      );
    });

    it('redirects staff logins to invite-not-found when no staff record exists', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockRejectedValueOnce(new NotFoundException()),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=invite-not-found&tenantSlug=lavacar-bh',
      );
    });

    it('redirects staff logins to staff-deactivated when the record is inactive', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'gerente@lavacar.com.br',
            role: 'MANAGER',
            isActive: false,
            googleOAuthId: null,
          }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=staff-deactivated&tenantSlug=lavacar-bh',
      );
    });

    it('redirects staff logins to email-mismatch when Google linking fails with 422', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'gerente@lavacar.com.br',
            role: 'MANAGER',
            isActive: true,
            googleOAuthId: 'different-google-sub',
          }),
        post: jest.fn().mockRejectedValueOnce(new UnprocessableEntityException()),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=email-mismatch&tenantSlug=lavacar-bh',
      );
    });

    it('redirects staff logins to account-linked-elsewhere when Google linking fails with 409', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'gerente@lavacar.com.br',
            role: 'MANAGER',
            isActive: true,
            googleOAuthId: 'different-google-sub',
          }),
        post: jest.fn().mockRejectedValueOnce(new ConflictException()),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-staff-123',
          email: 'gerente@lavacar.com.br',
          name: 'Carlos Gerente',
          tenantSlug: 'lavacar-bh',
          loginType: 'staff',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=account-linked-elsewhere&tenantSlug=lavacar-bh',
      );
    });

    it('redirects customer logins to no-tenant when tenantSlug is missing', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn() });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-123',
          email: 'joao@lavacar.com.br',
          name: 'João Silva',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=no-tenant',
      );
    });

    it('redirects customer logins to tenant-not-found when the tenant is missing', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValueOnce(new NotFoundException()),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      await service.handleGoogleCallback(
        {
          googleOAuthId: 'google-sub-123',
          email: 'joao@lavacar.com.br',
          name: 'João Silva',
          tenantSlug: 'lavacar-bh',
        } as GoogleProfile,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/auth/error?reason=tenant-not-found',
      );
    });
  });

  describe('logout()', () => {
    it('clears the cookie and redirects to the tenant slug', () => {
      const service = makeService();
      const res = makeRes();

      service.logout('lavacar-bh', res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/lavacar-bh');
    });

    it('redirects to the frontend root when tenantSlug is missing', () => {
      const service = makeService();
      const res = makeRes();

      service.logout(undefined, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });

    it('redirects to the frontend root when tenantSlug is invalid', () => {
      const service = makeService();
      const res = makeRes();

      service.logout('invalid slug', res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000');
    });
  });

  describe('getStaffTenants()', () => {
    it('returns only active staff records with tenant metadata resolved', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
            { staffId: 'inactive', tenantId: TENANT_ID_B, role: 'STAFF', isActive: false },
          ])
          .mockResolvedValueOnce([{ id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' }]),
      });
      const service = makeService(backendHttp);

      const result = await service.getStaffTenants();

      expect(result).toEqual([
        {
          staffId: STAFF_ID_A,
          tenantId: TENANT_ID_A,
          tenantSlug: 'lavacar-bh',
          tenantName: 'Lavacar BH',
          role: 'MANAGER',
        },
      ]);
    });

    it('returns an empty list when the staff member has no active assignments', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: false },
          ]),
      });
      const service = makeService(backendHttp);

      await expect(service.getStaffTenants()).resolves.toEqual([]);
    });

    it('throws when a tenant batch response misses a referenced tenant', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ])
          .mockResolvedValueOnce([]),
      });
      const service = makeService(backendHttp);

      await expect(service.getStaffTenants()).rejects.toThrow(
        `Tenant ${TENANT_ID_A} missing from batch response`,
      );
    });
  });

  describe('switchTenant()', () => {
    it('issues a token and returns the tenant slug', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            {
              tenantId: TENANT_ID_B,
              customerId: '20000000-0000-4000-8000-000000000002',
            },
          ])
          .mockResolvedValueOnce({
            id: TENANT_ID_B,
            slug: 'lavacar-centro',
            name: 'Lavacar Centro',
          }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();
      const dto: SwitchTenantDto = { targetTenantId: TENANT_ID_B };

      const result = await service.switchTenant(dto, currentUser, res);

      expect(result).toEqual({ tenantSlug: 'lavacar-centro', expiresIn: '7d' });
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('throws ForbiddenException when the customer is not registered in the target tenant', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce([]),
      });
      const service = makeService(backendHttp);
      const dto: SwitchTenantDto = { targetTenantId: TENANT_ID_B };

      await expect(service.switchTenant(dto, currentUser, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('switchStaffTenant()', () => {
    it('issues a token and returns the tenant slug', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ])
          .mockResolvedValueOnce({ id: TENANT_ID_A, slug: 'lavacar-bh', name: 'Lavacar BH' }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();
      const dto: SwitchStaffTenantDto = { staffId: STAFF_ID_A };

      const result = await service.switchStaffTenant(dto, currentUser, res);

      expect(result).toEqual({ tenantSlug: 'lavacar-bh', expiresIn: '7d' });
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('throws ForbiddenException when the staff record is inactive', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValue([
            { staffId: STAFF_ID_A, tenantId: TENANT_ID_A, role: 'MANAGER', isActive: false },
          ]),
      });
      const service = makeService(backendHttp);
      const dto: SwitchStaffTenantDto = { staffId: STAFF_ID_A };

      await expect(service.switchStaffTenant(dto, currentUser, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when no matching staff record exists', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { staffId: 'other-staff', tenantId: TENANT_ID_A, role: 'MANAGER', isActive: true },
          ]),
      });
      const service = makeService(backendHttp);
      const dto: SwitchStaffTenantDto = { staffId: STAFF_ID_A };

      await expect(service.switchStaffTenant(dto, currentUser, makeRes())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('devLogin()', () => {
    it('returns a customer token and user payload', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValueOnce({
          id: TENANT_ID_A,
          slug: 'lavacar-bh',
          name: 'Lavacar BH',
        }),
        post: jest.fn().mockResolvedValueOnce({ customerId: CUSTOMER_ID_A, created: false }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();
      const dto: DevLoginDto = {
        email: 'joao@gmail.com',
        tenantSlug: 'lavacar-bh',
        type: 'customer',
      };

      const result = await service.devLogin(dto, res);

      expect(result.user).toEqual({
        sub: CUSTOMER_ID_A,
        tenantId: TENANT_ID_A,
        tenantSlug: 'lavacar-bh',
        role: 'CUSTOMER',
      });
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
      );
      const [, token] = (res.cookie as jest.Mock).mock.calls[0] as [string, string];
      const decoded = jwtService.decode(token) as Record<string, unknown>;
      expect(decoded['sub']).toBe(CUSTOMER_ID_A);
      expect(decoded['tenantSlug']).toBe('lavacar-bh');
    });

    it('returns a staff token when dev auth resolves an existing staff account', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce([
            {
              staffId: STAFF_ID_A,
              tenantId: TENANT_ID_A,
              role: 'MANAGER',
              isActive: true,
              googleOAuthId: 'dev::gerente@lavacar.com.br',
            },
          ]),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      const result = await service.devLogin(
        {
          email: 'gerente@lavacar.com.br',
          tenantSlug: 'lavacar-bh',
          type: 'staff',
        },
        res,
      );

      expect(result.user).toEqual({
        sub: STAFF_ID_A,
        tenantId: TENANT_ID_A,
        tenantSlug: 'lavacar-bh',
        role: 'MANAGER',
      });
      expect(backendHttp.post).not.toHaveBeenCalled();
    });

    it('links a staff account when the dev OAuth ID is new', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce({
            id: TENANT_ID_A,
            slug: 'lavacar-bh',
            name: 'Lavacar BH',
            locale: 'pt-BR',
          })
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({
            staffId: STAFF_ID_A,
            email: 'gerente@lavacar.com.br',
            role: 'MANAGER',
            isActive: true,
            googleOAuthId: null,
          }),
        post: jest.fn().mockResolvedValueOnce({
          staffId: STAFF_ID_A,
          tenantId: TENANT_ID_A,
          role: 'MANAGER',
        }),
      });
      const service = makeService(backendHttp);
      const res = makeRes();

      const result = await service.devLogin(
        {
          email: 'gerente@lavacar.com.br',
          tenantSlug: 'lavacar-bh',
          type: 'staff',
        },
        res,
      );

      expect(result.user.role).toBe('MANAGER');
      expect(backendHttp.post).toHaveBeenCalledWith(
        '/internal/staff/30000000-0000-4000-8000-000000000001/link-google',
        expect.objectContaining({
          tenantId: TENANT_ID_A,
          googleOAuthId: 'dev::gerente@lavacar.com.br',
        }),
      );
    });

    it('throws ForbiddenException when dev auth is enabled in production', async () => {
      const service = makeService(makeBackendHttp(), makeConfigService({ nodeEnv: 'production' }));
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };

      await expect(service.devLogin(dto, makeRes())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects emails too long for the dev OAuth identifier', async () => {
      const service = makeService();
      const dto: DevLoginDto = {
        email: `${'a'.repeat(260)}@example.com`,
        tenantSlug: 'lavacar-bh',
        type: 'customer',
      };

      await expect(service.devLogin(dto, makeRes())).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws ForbiddenException when dev auth is disabled', async () => {
      const service = makeService(makeBackendHttp(), makeConfigService({ enableDevAuth: 'false' }));
      const dto: DevLoginDto = {
        email: 'admin@lavacar.com.br',
        tenantSlug: 'lavacar-bh',
        type: 'staff',
      };

      await expect(service.devLogin(dto, makeRes())).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
