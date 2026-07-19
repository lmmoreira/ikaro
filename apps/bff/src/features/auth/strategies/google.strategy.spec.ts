import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { OAUTH_NONCE_COOKIE_NAME } from '../cookie-options';
import { OAuthStateService } from '../oauth-state.service';
import { GoogleProfile, GoogleStrategy } from './google.strategy';

const TEST_SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';

function makeReq(state?: string, cookieNonce?: string): Request {
  return {
    query: { state },
    headers: cookieNonce ? { cookie: `${OAUTH_NONCE_COOKIE_NAME}=${cookieNonce}` } : {},
  } as unknown as Request;
}

function makeConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
      if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:3002/v1/auth/google/callback';
      return '';
    }),
  } as unknown as ConfigService;
}

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let jwtService: JwtService;
  let oauthState: OAuthStateService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: TEST_SECRET });
    oauthState = new OAuthStateService(jwtService);
    strategy = new GoogleStrategy(makeConfigService(), oauthState);
  });

  it('validate() maps Google profile fields correctly (customer, no tenantSlug)', (done) => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };
    const { state, nonce } = oauthState.encodeOAuthState('customer');

    strategy.validate(
      makeReq(state, nonce),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user).toEqual<GoogleProfile>({
          googleOAuthId: 'google-sub-123',
          email: 'joao@lavacar.com.br',
          name: 'João Silva',
          tenantSlug: undefined,
          loginType: undefined,
        });
        done();
      },
    );
  });

  it('validate() includes tenantSlug when the signed state carries a tenant slug', (done) => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };
    const { state, nonce } = oauthState.encodeOAuthState('customer', 'lavacar-bh');

    strategy.validate(
      makeReq(state, nonce),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.tenantSlug).toBe('lavacar-bh');
        expect(user?.loginType).toBeUndefined();
        done();
      },
    );
  });

  it('validate() sets loginType=staff with tenantSlug when the signed state is staff+slug', (done) => {
    const profile = {
      id: 'google-sub-staff',
      displayName: 'Carlos Gerente',
      emails: [{ value: 'gerente@lavacar.com.br' }],
    };
    const { state, nonce } = oauthState.encodeOAuthState('staff', 'lavacar-bh');

    strategy.validate(
      makeReq(state, nonce),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.loginType).toBe('staff');
        expect(user?.tenantSlug).toBe('lavacar-bh');
        done();
      },
    );
  });

  it('validate() sets loginType=staff and clears tenantSlug for a plain staff state', (done) => {
    const profile = {
      id: 'google-sub-staff',
      displayName: 'Carlos Gerente',
      emails: [{ value: 'gerente@lavacar.com.br' }],
    };
    const { state, nonce } = oauthState.encodeOAuthState('staff');

    strategy.validate(
      makeReq(state, nonce),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.loginType).toBe('staff');
        expect(user?.tenantSlug).toBeUndefined();
        done();
      },
    );
  });

  it('validate() calls done with error when profile has no emails', (done) => {
    const { state, nonce } = oauthState.encodeOAuthState('customer');
    strategy.validate(
      makeReq(state, nonce),
      'access-token',
      'refresh-token',
      { id: 'x', displayName: 'Y', emails: [] } as never,
      (err) => {
        expect(err).toBeInstanceOf(Error);
        done();
      },
    );
  });

  // M17-S32: decodeOAuthState() fails closed — every rejection reason maps to
  // done(err) here, never a silent fallback to the customer flow.
  describe('signed state validation (M17-S32)', () => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };

    it('calls done with error when state is missing', (done) => {
      strategy.validate(
        makeReq(),
        'access-token',
        'refresh-token',
        profile as never,
        (err, user) => {
          expect(err).toBeInstanceOf(Error);
          expect(user).toBeUndefined();
          done();
        },
      );
    });

    it('calls done with error when state is tampered', (done) => {
      const { state, nonce } = oauthState.encodeOAuthState('customer');
      const [header, payload] = state.split('.');
      const tampered = `${header}.${payload}.invalidsignature`;

      strategy.validate(
        makeReq(tampered, nonce),
        'access-token',
        'refresh-token',
        profile as never,
        (err, user) => {
          expect(err).toBeInstanceOf(Error);
          expect(user).toBeUndefined();
          done();
        },
      );
    });

    it('calls done with error when state is expired', (done) => {
      const nonce = 'x';
      const expiredState = jwtService.sign({ nonce }, { expiresIn: -10 });

      strategy.validate(
        makeReq(expiredState, nonce),
        'access-token',
        'refresh-token',
        profile as never,
        (err, user) => {
          expect(err).toBeInstanceOf(Error);
          expect(user).toBeUndefined();
          done();
        },
      );
    });

    // Review finding (M17-S32): a signed-but-unbound state doesn't prevent login CSRF /
    // authorization-code injection — a captured callback URL from an attacker-initiated
    // flow, replayed against a victim's browser, must be rejected because the victim's
    // browser never received the matching nonce cookie.
    it('calls done with error when the nonce cookie is missing (state replayed against a browser that never started this flow)', (done) => {
      const { state } = oauthState.encodeOAuthState('customer');

      strategy.validate(
        makeReq(state),
        'access-token',
        'refresh-token',
        profile as never,
        (err, user) => {
          expect(err).toBeInstanceOf(Error);
          expect(user).toBeUndefined();
          done();
        },
      );
    });

    it('calls done with error when the nonce cookie does not match the state (cross-browser replay / login CSRF)', (done) => {
      const { state } = oauthState.encodeOAuthState('customer');

      strategy.validate(
        makeReq(state, 'a-different-nonce-from-another-browser'),
        'access-token',
        'refresh-token',
        profile as never,
        (err, user) => {
          expect(err).toBeInstanceOf(Error);
          expect(user).toBeUndefined();
          done();
        },
      );
    });
  });
});
