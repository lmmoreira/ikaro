import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtIssuerService, JwtPayload } from './jwt-issuer.service';
import { issueCustomerToken, issueStaffToken } from './token-assembly';
import { TenantInfoResponse } from '../../shared/types/backend-responses';

const TEST_SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';

describe('token-assembly', () => {
  let jwtIssuer: JwtIssuerService;
  let jwtService: JwtService;

  const tenant: TenantInfoResponse = {
    id: 'tenant-uuid-1',
    slug: 'lavacar-belo',
    name: 'Lavacar Belo',
    locale: 'pt-BR',
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '7d' },
        }),
      ],
      providers: [JwtIssuerService],
    }).compile();

    jwtIssuer = moduleRef.get(JwtIssuerService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('issueStaffToken()', () => {
    it('assembles a token with the staff record sub and role', () => {
      const token = issueStaffToken(
        jwtIssuer,
        { staffId: 'staff-uuid-1', role: 'MANAGER' },
        tenant,
        'Gerente',
      );
      const decoded = jwtService.verify<JwtPayload>(token);

      expect(decoded).toEqual({
        sub: 'staff-uuid-1',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        userName: 'Gerente',
        role: 'MANAGER',
        locale: tenant.locale,
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
    });

    it('accepts a null userName', () => {
      const token = issueStaffToken(
        jwtIssuer,
        { staffId: 'staff-uuid-1', role: 'STAFF' },
        tenant,
        null,
      );
      const decoded = jwtService.verify<JwtPayload>(token);

      expect(decoded.userName).toBeNull();
    });
  });

  describe('issueCustomerToken()', () => {
    it('assembles a token with the customer id and a hardcoded CUSTOMER role', () => {
      const token = issueCustomerToken(jwtIssuer, 'customer-uuid-1', tenant, 'Cliente');
      const decoded = jwtService.verify<JwtPayload>(token);

      expect(decoded).toEqual({
        sub: 'customer-uuid-1',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        userName: 'Cliente',
        role: 'CUSTOMER',
        locale: tenant.locale,
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
    });
  });
});
