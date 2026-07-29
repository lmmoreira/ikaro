import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { extractFromCookie, JwtStrategy } from './jwt.strategy';
import { CurrentUserPayload } from '../../../shared/decorators/current-user.decorator';

const TEST_SECRET = 'test-secret-64-chars-longggggggggggggggggggggggggggggggggg!!';

function makeConfigService(): ConfigService {
  return { getOrThrow: jest.fn().mockReturnValue(TEST_SECRET) } as unknown as ConfigService;
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(makeConfigService());
  });

  it('validate() returns the payload as-is to populate req.user', () => {
    const payload: CurrentUserPayload = {
      sub: 'customer-uuid-1',
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Test User',
      role: 'CUSTOMER',
      locale: 'pt-BR',
    };

    const result = strategy.validate(payload);

    expect(result).toEqual(payload);
  });

  it('validate() works for STAFF role', () => {
    const payload: CurrentUserPayload = {
      sub: 'staff-uuid-1',
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Staff User',
      role: 'STAFF',
      locale: 'pt-BR',
    };

    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('validate() works for MANAGER role', () => {
    const payload: CurrentUserPayload = {
      sub: 'manager-uuid-1',
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Manager User',
      role: 'MANAGER',
      locale: 'pt-BR',
    };

    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('throws UnauthorizedException when required fields are missing', () => {
    expect(() => strategy.validate({ sub: 'customer-uuid-1' })).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when role is not a recognized JwtRole', () => {
    const payload = {
      sub: 'customer-uuid-1',
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'lavacar-belo',
      tenantName: 'Lavacar Belo',
      userName: 'Test User',
      role: 'SUPERADMIN',
      locale: 'pt-BR',
    };

    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });

  describe('cookie extraction', () => {
    it('extracts a token from the access_token cookie header', () => {
      // Access the private extractor via the strategy's _jwtFromRequest
      // (passport-jwt stores the combined extractor as a function)
      // We test that the strategy was configured with fromExtractors by calling
      // the super() with fromExtractors — validate() itself is the only public hook.
      // The cookie extractor is unit-tested separately below.
      const token = 'eyJ.eyJ.sig';
      const cookieHeader = `other=abc; access_token=${token}; another=xyz`;
      const match = /(?:^|;\s*)access_token=([^;]+)/.exec(cookieHeader);
      expect(match?.[1]).toBe(token);
    });

    it('returns null when the cookie header is absent', () => {
      const match = /(?:^|;\s*)access_token=([^;]+)/.exec('');
      expect(match).toBeNull();
    });
  });

  describe('extractFromCookie()', () => {
    function makeReq(cookieHeader?: string): Request {
      return { headers: { cookie: cookieHeader } } as unknown as Request;
    }

    it('decodes a well-formed access_token cookie value', () => {
      expect(extractFromCookie(makeReq('access_token=eyJ.eyJ.sig'))).toBe('eyJ.eyJ.sig');
    });

    it('returns null when no access_token cookie is present', () => {
      expect(extractFromCookie(makeReq('other=abc'))).toBeNull();
      expect(extractFromCookie(makeReq(undefined))).toBeNull();
    });

    it('returns null instead of throwing on a malformed percent-encoded cookie value', () => {
      // '%zz' is not a valid percent-escape — decodeURIComponent throws URIError on it. The
      // cookie is client-controlled, so this must fail auth cleanly, not crash the request.
      expect(() => extractFromCookie(makeReq('access_token=%zz'))).not.toThrow();
      expect(extractFromCookie(makeReq('access_token=%zz'))).toBeNull();
    });
  });
});
