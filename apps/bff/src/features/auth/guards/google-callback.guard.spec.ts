import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { OAuthStateInvalidError } from '../oauth-state';
import { GoogleCallbackGuard } from './google-callback.guard';

describe('GoogleCallbackGuard', () => {
  let guard: GoogleCallbackGuard;

  beforeEach(() => {
    guard = new GoogleCallbackGuard();
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
