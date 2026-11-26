import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { devSignupSession, handleSignupLogin } from './auth-signup-login.flow';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { SignupSessionService } from './signup-session.service';

const SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';
const FRONTEND = 'https://app.test';

function configOf(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function resMock(): { cookie: jest.Mock; redirect: jest.Mock } {
  return { cookie: jest.fn(), redirect: jest.fn() };
}

const profile = (emailVerified: boolean) => ({
  googleOAuthId: 'sub-123',
  email: 'dona@gmail.com',
  name: 'Dona',
  loginType: 'signup' as const,
  emailVerified,
});

describe('self-signup Google step (UC-127)', () => {
  let sessions: SignupSessionService;

  beforeEach(() => {
    sessions = new SignupSessionService(new JwtService({ secret: SECRET }));
  });

  describe('handleSignupLogin', () => {
    it('keeps the verified identity in the signup cookie and redirects to the form step', () => {
      const res = resMock();

      handleSignupLogin(
        sessions,
        configOf({}),
        profile(true),
        res as unknown as Response,
        FRONTEND,
      );

      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie.mock.calls[0][0]).toContain('signup_session');
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND}/ikaro-trial/entrar`);
    });

    it('refuses an unverified Google email: no cookie, redirect to the unverified page', () => {
      const res = resMock();

      handleSignupLogin(
        sessions,
        configOf({}),
        profile(false),
        res as unknown as Response,
        FRONTEND,
      );

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND}/ikaro-trial/conta-nao-verificada`);
    });

    it('answers 503 SIGNUP_CLOSED while the kill switch is off, and sets nothing', () => {
      const res = resMock();

      expect(() =>
        handleSignupLogin(
          sessions,
          configOf({ FEATURE_FLAG_SIGNUP_ENABLED: false }),
          profile(true),
          res as unknown as Response,
          FRONTEND,
        ),
      ).toThrow(expect.objectContaining({ status: 503 }));
      expect(res.cookie).not.toHaveBeenCalled();
    });

    // Negative guarantee: no tenant exists yet, so no tenant JWT (the session cookie) is ever set.
    it('never sets the session cookie', () => {
      const res = resMock();

      handleSignupLogin(
        sessions,
        configOf({}),
        profile(true),
        res as unknown as Response,
        FRONTEND,
      );

      expect(res.cookie.mock.calls.map((call) => call[0])).not.toContain(SESSION_COOKIE_NAME);
    });
  });

  describe('devSignupSession', () => {
    const dto = { email: 'dev@test.com', name: 'Dev', googleSub: 'dev-sub' };

    it('sets the same cookie when dev auth is enabled', () => {
      const res = resMock();

      expect(
        devSignupSession(
          sessions,
          configOf({ ENABLE_DEV_AUTH: 'true', APP_ENV: 'local' }),
          dto,
          res as unknown as Response,
        ),
      ).toEqual({ ok: true });
      expect(res.cookie).toHaveBeenCalledTimes(1);
    });

    it('is refused when dev auth is off, and in production even when it is on', () => {
      const res = resMock();

      expect(() =>
        devSignupSession(sessions, configOf({}), dto, res as unknown as Response),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(() =>
        devSignupSession(
          sessions,
          configOf({ ENABLE_DEV_AUTH: 'true', APP_ENV: 'production' }),
          dto,
          res as unknown as Response,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });
});
