import { JwtService } from '@nestjs/jwt';
import { makeExecutionContext } from '../../../test/execution-context.factory';
import { OAUTH_NONCE_COOKIE_NAME, OAUTH_NONCE_COOKIE_OPTIONS } from '../cookie-options';
import { OAuthStatePayload } from '../oauth-state';
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
});
