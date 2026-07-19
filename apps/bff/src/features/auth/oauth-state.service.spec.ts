import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { OAuthStateService } from './oauth-state.service';
import { OAuthStatePayload } from './oauth-state';

const TEST_SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';

describe('OAuthStateService', () => {
  let service: OAuthStateService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_SECRET,
          signOptions: { expiresIn: '7d' },
        }),
      ],
      providers: [OAuthStateService],
    }).compile();

    service = moduleRef.get(OAuthStateService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('encodeOAuthState()', () => {
    it('returns a JWT string', () => {
      const state = service.encodeOAuthState('customer');
      expect(state.split('.')).toHaveLength(3);
    });

    it('customer, no tenantSlug — payload has neither loginType nor tenantSlug', () => {
      const state = service.encodeOAuthState('customer');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.loginType).toBeUndefined();
      expect(payload.tenantSlug).toBeUndefined();
      expect(payload.nonce).toBeDefined();
    });

    it('customer with a valid tenantSlug — payload carries it', () => {
      const state = service.encodeOAuthState('customer', 'lavacar-bh');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.tenantSlug).toBe('lavacar-bh');
      expect(payload.loginType).toBeUndefined();
    });

    it('customer with an invalid tenantSlug — dropped from the payload', () => {
      const state = service.encodeOAuthState('customer', '../evil');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.tenantSlug).toBeUndefined();
    });

    it('staff, no tenantSlug — payload has loginType=staff only', () => {
      const state = service.encodeOAuthState('staff');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBeUndefined();
    });

    it('staff with a valid tenantSlug — payload carries both', () => {
      const state = service.encodeOAuthState('staff', 'lavacar-bh');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBe('lavacar-bh');
    });

    it('staff with an invalid tenantSlug — falls back to loginType=staff only', () => {
      const state = service.encodeOAuthState('staff', '../hack');
      const payload = jwtService.verify<OAuthStatePayload>(state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBeUndefined();
    });

    it('two calls produce different nonces', () => {
      const first = jwtService.verify<OAuthStatePayload>(service.encodeOAuthState('customer'));
      const second = jwtService.verify<OAuthStatePayload>(service.encodeOAuthState('customer'));
      expect(first.nonce).not.toBe(second.nonce);
    });

    it('expires in ~5 minutes', () => {
      const before = Math.floor(Date.now() / 1000);
      const state = service.encodeOAuthState('customer');
      const payload = jwtService.verify<OAuthStatePayload & { iat: number; exp: number }>(state);
      const after = Math.floor(Date.now() / 1000);

      const fiveMinutesInSeconds = 5 * 60;
      expect(payload.exp - payload.iat).toBe(fiveMinutesInSeconds);
      expect(payload.exp).toBeGreaterThanOrEqual(before + fiveMinutesInSeconds);
      expect(payload.exp).toBeLessThanOrEqual(after + fiveMinutesInSeconds);
    });
  });

  describe('decodeOAuthState()', () => {
    it('round-trips a customer state with a tenantSlug', () => {
      const state = service.encodeOAuthState('customer', 'lavacar-bh');
      expect(service.decodeOAuthState(state)).toEqual({
        loginType: undefined,
        tenantSlug: 'lavacar-bh',
      });
    });

    it('round-trips a staff state with a tenantSlug', () => {
      const state = service.encodeOAuthState('staff', 'lavacar-bh');
      expect(service.decodeOAuthState(state)).toEqual({
        loginType: 'staff',
        tenantSlug: 'lavacar-bh',
      });
    });

    it('round-trips a plain staff state', () => {
      const state = service.encodeOAuthState('staff');
      expect(service.decodeOAuthState(state)).toEqual({
        loginType: 'staff',
        tenantSlug: undefined,
      });
    });

    it('throws when state is missing (empty string)', () => {
      expect(() => service.decodeOAuthState('')).toThrow();
    });

    it('throws when state is tampered', () => {
      const state = service.encodeOAuthState('customer');
      const [header, payload] = state.split('.');
      const tampered = `${header}.${payload}.invalidsignature`;
      expect(() => service.decodeOAuthState(tampered)).toThrow();
    });

    it('throws when state was signed with a different secret', () => {
      const foreignState = jwtService.sign(
        { nonce: 'x' },
        { secret: 'completely-different-secret-64-chars-longggggggggggggggg' },
      );
      expect(() => service.decodeOAuthState(foreignState)).toThrow();
    });

    it('throws when state is expired', () => {
      const expiredState = jwtService.sign({ nonce: 'x' }, { expiresIn: -10 });
      expect(() => service.decodeOAuthState(expiredState)).toThrow();
    });
  });
});
