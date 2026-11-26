import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { OAuthStateInvalidError } from './oauth-state';
import { OAuthStateService } from './oauth-state.service';
import { SIGNUP_COOKIE_OPTIONS } from './cookie-options';
import {
  SIGNUP_RESEND_COOKIE_NAME,
  SIGNUP_SESSION_COOKIE_NAME,
  SignupSessionService,
} from './signup-session.service';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { extractFromCookie } from './strategies/jwt.strategy';

const SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';
const SESSION = { email: 'dona@gmail.com', name: 'Dona', googleSub: 'sub-123' };

function reqWithCookie(name: string, value: string): Request {
  return { headers: { cookie: `${name}=${encodeURIComponent(value)}` } } as unknown as Request;
}

function resMock(): { cookie: jest.Mock; clearCookie: jest.Mock } {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('SignupSessionService', () => {
  let jwt: JwtService;
  let service: SignupSessionService;

  beforeEach(() => {
    jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '7d' } });
    service = new SignupSessionService(jwt);
  });

  function issuedToken(): string {
    const res = resMock();
    service.issueSession(res as unknown as Response, SESSION);
    return res.cookie.mock.calls[0][1] as string;
  }

  describe('the signup session cookie', () => {
    it('is httpOnly, SameSite=Lax, Path=/, 30 minutes, under its own cookie name', () => {
      const res = resMock();

      service.issueSession(res as unknown as Response, SESSION);

      expect(res.cookie).toHaveBeenCalledWith(
        SIGNUP_SESSION_COOKIE_NAME,
        expect.any(String),
        SIGNUP_COOKIE_OPTIONS,
      );
      expect(SIGNUP_COOKIE_OPTIONS).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 60 * 1000,
      });
      expect(SIGNUP_SESSION_COOKIE_NAME).not.toBe(SESSION_COOKIE_NAME);
    });

    it('carries only the three identity fields, plus its typ and aud claims (no tenant, no sub)', () => {
      const claims = jwt.decode(issuedToken()) as Record<string, unknown>;

      expect(Object.keys(claims).sort()).toEqual(
        ['aud', 'email', 'exp', 'googleSub', 'iat', 'name', 'typ'].sort(),
      );
      expect(claims['aud']).toBe('signup-session');
      expect(claims['typ']).toBe('signup-session');
    });

    it('expires in 30 minutes', () => {
      const claims = jwt.decode(issuedToken()) as { iat: number; exp: number };

      expect(claims.exp - claims.iat).toBe(30 * 60);
    });

    it('is read back from the request, and cleared with the same attributes', () => {
      const token = issuedToken();
      const res = resMock();

      expect(service.readSession(reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, token))).toEqual(
        SESSION,
      );
      service.clearSession(res as unknown as Response);
      expect(res.clearCookie).toHaveBeenCalledWith(
        SIGNUP_SESSION_COOKIE_NAME,
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it.each([
      ['a missing cookie', {} as Request],
      ['a tampered token', reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, 'a.b.c')],
      [
        'a malformed percent-escape',
        {
          headers: { cookie: `${SIGNUP_SESSION_COOKIE_NAME}=%E0%A4%A` },
        } as unknown as Request,
      ],
    ])('reads null for %s', (_name, req) => {
      expect(service.readSession(req)).toBeNull();
    });

    it('reads null for an expired session', () => {
      const expired = jwt.sign(
        { typ: 'signup-session', ...SESSION },
        { audience: 'signup-session', expiresIn: '-1s' },
      );

      expect(service.readSession(reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, expired))).toBeNull();
    });
  });

  describe('cross-rejection (a token of one kind is never accepted as another)', () => {
    it('rejects a session JWT as a signup session', () => {
      const sessionJwt = jwt.sign({
        sub: 'staff-1',
        tenantId: 't-1',
        tenantSlug: 'lava',
        role: 'MANAGER',
      });

      expect(service.readSession(reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, sessionJwt))).toBeNull();
    });

    it('rejects an OAuth state as a signup session', () => {
      const { state } = new OAuthStateService(jwt).encodeOAuthState('signup');

      expect(service.readSession(reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, state))).toBeNull();
    });

    it('rejects the resend credential as a signup session, and the other way round', () => {
      const res = resMock();
      service.issueResendCredential(res as unknown as Response, {
        tenantId: 't-1',
        email: SESSION.email,
      });
      const resendToken = res.cookie.mock.calls[0][1] as string;

      expect(
        service.readSession(reqWithCookie(SIGNUP_SESSION_COOKIE_NAME, resendToken)),
      ).toBeNull();
      expect(
        service.readResendCredential(reqWithCookie(SIGNUP_RESEND_COOKIE_NAME, issuedToken())),
      ).toBeNull();
    });

    it('is not accepted as a session JWT by the session strategy, nor as an OAuth state', () => {
      const token = issuedToken();
      // Whatever cookie name carries it, the session strategy parses a CurrentUserPayload: a
      // signup session has no sub, tenantId or role, so it can never authenticate.
      expect(extractFromCookie(reqWithCookie(SESSION_COOKIE_NAME, token))).toBe(token);
      expect(() => new OAuthStateService(jwt).decodeOAuthState(token, 'nonce')).toThrow(
        OAuthStateInvalidError,
      );
    });
  });

  describe('the resend credential', () => {
    it('is bound to the tenant and the email, 30 minutes, and read back', () => {
      const res = resMock();

      service.issueResendCredential(res as unknown as Response, {
        tenantId: 't-1',
        email: SESSION.email,
      });

      expect(res.cookie).toHaveBeenCalledWith(
        SIGNUP_RESEND_COOKIE_NAME,
        expect.any(String),
        SIGNUP_COOKIE_OPTIONS,
      );
      const token = res.cookie.mock.calls[0][1] as string;
      expect(service.readResendCredential(reqWithCookie(SIGNUP_RESEND_COOKIE_NAME, token))).toEqual(
        { tenantId: 't-1', email: SESSION.email },
      );
    });
  });
});
