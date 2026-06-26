import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { JwtIssuerService, JwtPayload } from './jwt-issuer.service';

const TEST_SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';

describe('JwtIssuerService', () => {
  let service: JwtIssuerService;
  let jwtService: JwtService;

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

    service = moduleRef.get(JwtIssuerService);
    jwtService = moduleRef.get(JwtService);
  });

  it('issueToken() returns a JWT string', () => {
    const token = service.issueToken({
      sub: 'customer-uuid-1',
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Test User',
      role: 'CUSTOMER',
    });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('issued token decodes to the correct payload structure', () => {
    const payload: JwtPayload = {
      sub: 'customer-uuid-abc',
      tenantId: 'tenant-uuid-xyz',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Test User',
      role: 'CUSTOMER',
    };

    const token = service.issueToken(payload);
    const decoded = jwtService.verify<JwtPayload & { iat: number; exp: number }>(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.tenantId).toBe(payload.tenantId);
    expect(decoded.tenantSlug).toBe(payload.tenantSlug);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('sub is the backend entity UUID — not a Google OAuth sub', () => {
    const backendUuid = '01961234-abcd-7000-8000-000000000001';
    const token = service.issueToken({
      sub: backendUuid,
      tenantId: 'tenant-1',
      tenantSlug: 'slug-1',
      tenantName: 'Tenant 1',
      userName: 'Staff User',
      role: 'STAFF',
    });
    const decoded = jwtService.verify<JwtPayload>(token);

    expect(decoded.sub).toBe(backendUuid);
  });

  it('issues tokens for all three roles', () => {
    for (const role of ['CUSTOMER', 'STAFF', 'MANAGER'] as const) {
      const token = service.issueToken({
        sub: 'uuid-1',
        tenantId: 'tenant-1',
        tenantSlug: 'slug-1',
        tenantName: 'Tenant 1',
        userName: 'Test User',
        role,
      });
      const decoded = jwtService.verify<JwtPayload>(token);
      expect(decoded.role).toBe(role);
    }
  });

  it('token expires in ~7 days', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = service.issueToken({
      sub: 'uuid-1',
      tenantId: 'tenant-1',
      tenantSlug: 'slug-1',
      tenantName: 'Tenant 1',
      userName: 'Manager User',
      role: 'MANAGER',
    });
    const decoded = jwtService.verify<JwtPayload & { iat: number; exp: number }>(token);
    const after = Math.floor(Date.now() / 1000);

    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    expect(decoded.exp - decoded.iat).toBe(sevenDaysInSeconds);
    expect(decoded.exp).toBeGreaterThanOrEqual(before + sevenDaysInSeconds);
    expect(decoded.exp).toBeLessThanOrEqual(after + sevenDaysInSeconds);
  });

  it('a token with a tampered signature fails verification', () => {
    const token = service.issueToken({
      sub: 'uuid-1',
      tenantId: 'tenant-1',
      tenantSlug: 'slug-1',
      tenantName: 'Tenant 1',
      userName: 'Test User',
      role: 'CUSTOMER',
    });
    const [header, payload] = token.split('.');
    const tamperedToken = `${header}.${payload}.invalidsignature`;

    expect(() => jwtService.verify(tamperedToken)).toThrow();
  });

  it('a token signed with a different secret fails verification', () => {
    const token = service.issueToken({
      sub: 'uuid-1',
      tenantId: 'tenant-1',
      tenantSlug: 'slug-1',
      tenantName: 'Tenant 1',
      userName: 'Test User',
      role: 'CUSTOMER',
    });

    expect(() =>
      jwtService.verify(token, {
        secret: 'completely-different-secret-64-chars-longggggggggggggggg',
      }),
    ).toThrow();
  });
});
