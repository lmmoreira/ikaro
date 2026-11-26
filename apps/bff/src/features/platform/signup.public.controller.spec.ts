import { JwtService } from '@nestjs/jwt';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import type { Request, Response } from 'express';
import { SignupErrorCode } from '@ikaro/types';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { SIGNUP_SESSION_COOKIE_NAME, SignupSessionService } from '../auth/signup-session.service';
import { THROTTLE_ERROR_CODE_KEY } from '../../shared/decorators/throttle-error-code.decorator';
import { IS_PUBLIC_KEY } from '../../shared/decorators/public.decorator';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { SignupPublicController } from './signup.public.controller';
import { SignupTenantBodySchema, SlugAvailabilityQuerySchema } from './signup.public.schemas';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

import { SignupService } from './signup.service';

const SECRET = 'test-secret-that-is-at-least-64-characters-long-for-jwt-signing!!';
const SESSION = { email: 'dona@gmail.com', name: 'Dona', googleSub: 'sub-123' };

function build() {
  const get = jest.fn();
  const signupSessions = new SignupSessionService(new JwtService({ secret: SECRET }));
  const signupFn = jest.fn();
  const controller = new SignupPublicController(makeBackendHttp({ get }), signupSessions, {
    signup: signupFn,
  } as unknown as SignupService);
  return { controller, get, signupSessions, signupFn };
}

function reqWithSession(signupSessions: SignupSessionService): Request {
  const res = { cookie: jest.fn() };
  signupSessions.issueSession(res as unknown as Response, SESSION);
  const token = res.cookie.mock.calls[0][1] as string;
  return {
    headers: {
      cookie: `${SIGNUP_SESSION_COOKIE_NAME}=${token}`,
      'x-real-client-ip': '203.0.113.9',
    },
    ip: '10.0.0.1',
  } as unknown as Request;
}

const NO_COOKIE = { headers: {} } as unknown as Request;
const BODY = {
  businessName: 'Lava Car Top',
  slug: 'lavacar-top',
  countryCode: 'BR',
  taxId: '529.982.247-25',
  acceptedTermsVersion: '2026-11',
  turnstileToken: 't',
};

describe('SignupPublicController', () => {
  describe('getSlugAvailability', () => {
    it('forwards the slug to the backend slug check and returns its verdict as is', async () => {
      const { controller, get } = build();
      get.mockResolvedValue({ status: 'invalid', reason: 'TOO_SHORT' });

      await expect(controller.getSlugAvailability({ slug: 'ab' })).resolves.toEqual({
        status: 'invalid',
        reason: 'TOO_SHORT',
      });
      expect(get).toHaveBeenCalledWith('/internal/signup/slug-availability', { slug: 'ab' });
    });

    it('propagates a backend failure instead of inventing a verdict', async () => {
      const { controller, get } = build();
      get.mockRejectedValue(new Error('backend down'));

      await expect(controller.getSlugAvailability({ slug: 'lavacar' })).rejects.toThrow(
        'backend down',
      );
    });

    it('is public, never cached and throttled at 30 requests per minute', () => {
      const handler = SignupPublicController.prototype.getSlugAvailability;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    });
  });

  describe('getSession', () => {
    it('answers the session identity plus the read-only trial answer and the terms version', async () => {
      const { controller, get, signupSessions } = build();
      get.mockResolvedValue({
        trialAvailable: false,
        existingTenantSlug: 'lava-1',
        termsVersion: '2026-11',
      });

      await expect(controller.getSession(reqWithSession(signupSessions))).resolves.toEqual({
        email: 'dona@gmail.com',
        name: 'Dona',
        trialAvailable: false,
        existingTenantSlug: 'lava-1',
        termsVersion: '2026-11',
      });
      expect(get).toHaveBeenCalledWith('/internal/billing/registrations/eligibility', {
        googleSub: 'sub-123',
      });
    });

    it('omits existingTenantSlug when there is none', async () => {
      const { controller, get, signupSessions } = build();
      get.mockResolvedValue({ trialAvailable: true, existingTenantSlug: null, termsVersion: 'v' });

      const result = await controller.getSession(reqWithSession(signupSessions));

      expect(Object.keys(result)).not.toContain('existingTenantSlug');
    });

    it('answers 401 without a valid cookie, before any backend call', async () => {
      const { controller, get } = build();

      await expect(controller.getSession(NO_COOKIE)).rejects.toMatchObject({ status: 401 });
      expect(get).not.toHaveBeenCalled();
    });

    it('is public and never cached', () => {
      const handler = SignupPublicController.prototype.getSession;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
    });
  });

  describe('createTenant', () => {
    function resMock() {
      return { cookie: jest.fn(), clearCookie: jest.fn() };
    }

    it('signs up with the session identity and the visitor IP, then swaps the cookies', async () => {
      const { controller, signupFn, signupSessions } = build();
      signupFn.mockResolvedValue({
        tenantId: 'tenant-1',
        tenantSlug: 'lavacar-top',
        nextPath: '/ikaro-trial/conta-criada',
      });
      const res = resMock();

      const result = await controller.createTenant(
        reqWithSession(signupSessions),
        res as unknown as Response,
        BODY,
      );

      expect(signupFn).toHaveBeenCalledWith(SESSION, BODY, '203.0.113.9');
      expect(result).toEqual({ tenantSlug: 'lavacar-top', nextPath: '/ikaro-trial/conta-criada' });
      expect(res.clearCookie).toHaveBeenCalledWith(SIGNUP_SESSION_COOKIE_NAME, expect.anything());
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie.mock.calls[0][0]).toContain('signup_resend');
    });

    // Negative guarantees: the tenant id never reaches the client, and no tenant JWT is issued.
    it('returns only the slug and the next path, and never sets the session cookie', async () => {
      const { controller, signupFn, signupSessions } = build();
      signupFn.mockResolvedValue({ tenantId: 'tenant-1', tenantSlug: 's', nextPath: '/p' });
      const res = resMock();

      const result = await controller.createTenant(
        reqWithSession(signupSessions),
        res as unknown as Response,
        BODY,
      );

      expect(Object.keys(result).sort()).toEqual(['nextPath', 'tenantSlug']);
      expect(res.cookie.mock.calls.map((call) => call[0])).not.toContain(SESSION_COOKIE_NAME);
    });

    it('keeps the signup session and sets no resend credential when the signup fails', async () => {
      const { controller, signupFn, signupSessions } = build();
      signupFn.mockRejectedValue(new Error('refused'));
      const res = resMock();

      await expect(
        controller.createTenant(reqWithSession(signupSessions), res as unknown as Response, BODY),
      ).rejects.toThrow('refused');

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('answers 401 without a session, before the orchestration', async () => {
      const { controller, signupFn } = build();

      await expect(
        controller.createTenant(NO_COOKIE, resMock() as unknown as Response, BODY),
      ).rejects.toMatchObject({ status: 401 });
      expect(signupFn).not.toHaveBeenCalled();
    });

    it('is public, 201, never cached, throttled at 10 per minute and answers SIGNUP_RATE_LIMITED', () => {
      const handler = SignupPublicController.prototype.createTenant;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata('__httpCode__', handler)).toBe(201);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(10);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
      expect(Reflect.getMetadata(THROTTLE_ERROR_CODE_KEY, handler)).toBe(
        SignupErrorCode.RATE_LIMITED,
      );
    });
  });

  describe('SignupTenantBodySchema', () => {
    it('rejects a blank or oversized business name before any backend call', () => {
      expect(SignupTenantBodySchema.safeParse({ ...BODY, businessName: '   ' }).success).toBe(
        false,
      );
      expect(
        SignupTenantBodySchema.safeParse({ ...BODY, businessName: 'a'.repeat(121) }).success,
      ).toBe(false);
    });

    it('takes no email or name: the visitor identity comes only from the signup session', () => {
      const parsed = SignupTenantBodySchema.parse({ ...BODY, email: 'x@y.z', name: 'Evil' });

      expect(Object.keys(parsed)).not.toContain('email');
      expect(Object.keys(parsed)).not.toContain('name');
    });

    it('checks only the shape: a blank tax id or terms version is left to Billing', () => {
      expect(
        SignupTenantBodySchema.safeParse({ ...BODY, taxId: undefined, acceptedTermsVersion: '' })
          .success,
      ).toBe(true);
      expect(SignupTenantBodySchema.safeParse({ ...BODY, turnstileToken: '' }).success).toBe(false);
    });
  });

  describe('SlugAvailabilityQuerySchema', () => {
    it('checks only the shape: a present string, whatever its length or characters', () => {
      for (const slug of ['', 'a', 'UPPER', 'a'.repeat(500), 'dashboard']) {
        expect(SlugAvailabilityQuerySchema.safeParse({ slug }).success).toBe(true);
      }
    });

    it('rejects a missing or non-string slug', () => {
      expect(SlugAvailabilityQuerySchema.safeParse({}).success).toBe(false);
      expect(SlugAvailabilityQuerySchema.safeParse({ slug: ['a', 'b'] }).success).toBe(false);
    });
  });
});
