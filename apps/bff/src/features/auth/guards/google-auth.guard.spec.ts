import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { BffErrorCode } from '@ikaro/types';
import { makeExecutionContext } from '../../../test/execution-context.factory';
import { OAUTH_NONCE_COOKIE_NAME, OAUTH_NONCE_COOKIE_OPTIONS } from '../cookie-options';
import { OAuthStateInvalidError, OAuthStatePayload } from '../oauth-state';
import { OAuthStateService } from '../oauth-state.service';
import { GoogleAuthGuard } from './google-auth.guard';

const TEST_SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';

function makeRes(): { cookie: jest.Mock; clearCookie: jest.Mock } {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('GoogleAuthGuard', () => {
  let guard: GoogleAuthGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: TEST_SECRET });
    guard = new GoogleAuthGuard(new OAuthStateService(jwtService));
  });

  describe('getAuthenticateOptions() — customer login', () => {
    it('signs a state with neither loginType nor tenantSlug when none is provided, and sets the nonce cookie', () => {
      const res = makeRes();
      const opts = guard.getAuthenticateOptions(makeExecutionContext({ res })) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.loginType).toBeUndefined();
      expect(payload.tenantSlug).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        OAUTH_NONCE_COOKIE_NAME,
        payload.nonce,
        OAUTH_NONCE_COOKIE_OPTIONS,
      );
    });

    it('signs a state carrying tenantSlug when provided', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { tenantSlug: 'lavacar-bh' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.tenantSlug).toBe('lavacar-bh');
    });

    it('drops tenantSlug with invalid characters from the signed state', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { tenantSlug: '../evil' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.tenantSlug).toBeUndefined();
    });
  });

  describe('getAuthenticateOptions() — staff login', () => {
    it('signs loginType=staff for type=staff without tenantSlug (regular login)', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBeUndefined();
    });

    it('signs loginType=staff + tenantSlug for type=staff with a valid tenantSlug (first login)', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: 'lavacar-bh' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBe('lavacar-bh');
    });

    it('falls back to loginType=staff only when tenantSlug has invalid characters', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: '../hack' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBeUndefined();
    });

    it('falls back to loginType=staff only when tenantSlug is empty string', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: '' } }),
      ) as { state: string };
      const payload = jwtService.verify<OAuthStatePayload>(opts.state);
      expect(payload.loginType).toBe('staff');
      expect(payload.tenantSlug).toBeUndefined();
    });
  });

  describe('handleRequest()', () => {
    it('returns the user when no error and user is present', () => {
      const user = { googleOAuthId: 'google-sub-123', email: 'joao@lavacar.com.br', name: 'João' };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('throws 400 BFF_OAUTH_STATE_INVALID when the strategy rejected with OAuthStateInvalidError (tampered/expired/missing state, or nonce/cookie mismatch)', () => {
      const err = new OAuthStateInvalidError('OAuth state is invalid or expired');
      expect(() => guard.handleRequest(err, null)).toThrow(HttpException);
      try {
        guard.handleRequest(err, null);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body['status']).toBe(400);
        expect(body['code']).toBe(BffErrorCode.OAUTH_STATE_INVALID);
      }
    });

    it('rethrows the original error unchanged for unrelated Passport failures (e.g. Google returning no email) — never mislabeled as a state problem', () => {
      const err = new Error('Google account did not provide an email address');
      expect(() => guard.handleRequest(err, null)).toThrow(err);
      expect(() => guard.handleRequest(err, null)).not.toThrow(HttpException);
    });

    it('throws a generic 401 UnauthorizedException when there is no error but no user either', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
    });
  });
});
