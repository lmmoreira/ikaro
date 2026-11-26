import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SIGNUP_COOKIE_OPTIONS } from './cookie-options';

const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

// Mirrors SESSION_COOKIE_NAME: the `__Host-` prefix pins the cookie to this host, Secure, Path=/.
export const SIGNUP_SESSION_COOKIE_NAME = IS_PRODUCTION
  ? '__Host-signup_session'
  : 'signup_session';
export const SIGNUP_RESEND_COOKIE_NAME = IS_PRODUCTION ? '__Host-signup_resend' : 'signup_resend';

// The `aud` claim is what keeps these JWTs apart from a session JWT (no `aud`), an OAuth state
// (no `aud`, carries a nonce) and from each other: every reader verifies its own audience.
const SESSION_AUDIENCE = 'signup-session';
const RESEND_AUDIENCE = 'signup-resend';
const SIGNUP_TTL = '30m';

const SessionClaimsSchema = z.object({
  typ: z.literal(SESSION_AUDIENCE),
  email: z.string().min(1),
  name: z.string(),
  googleSub: z.string().min(1),
});
const ResendClaimsSchema = z.object({
  typ: z.literal(RESEND_AUDIENCE),
  tenantId: z.string().min(1),
  email: z.string().min(1),
});

/** What the signup session carries: the verified Google identity and nothing else (no tenant). */
export interface SignupSession {
  email: string;
  name: string;
  googleSub: string;
}

/** What the resend credential carries: the tenant just created and the email it was sent to. */
export interface SignupResendCredential {
  tenantId: string;
  email: string;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers?.cookie ?? '';
  const match = new RegExp(String.raw`(?:^|;\s*)${name}=([^;]+)`).exec(raw);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // A malformed percent-escape in a client-controlled cookie is "no cookie", not a crash.
    return null;
  }
}

/**
 * The two short-lived cookies of a self-signup (UC-127): the **signup session** set after the
 * Google step (before any tenant exists) and the **resend credential** set by the `201`. Both are
 * `JwtService` JWTs on the existing `JWT_SECRET` (the `OAuthStateService` precedent: no new secret),
 * told apart by `typ`/`aud`, and neither is ever a tenant JWT.
 */
@Injectable()
export class SignupSessionService {
  constructor(private readonly jwt: JwtService) {}

  issueSession(res: Response, session: SignupSession): void {
    const token = this.jwt.sign(
      { typ: SESSION_AUDIENCE, ...session },
      { audience: SESSION_AUDIENCE, expiresIn: SIGNUP_TTL },
    );
    res.cookie(SIGNUP_SESSION_COOKIE_NAME, token, SIGNUP_COOKIE_OPTIONS);
  }

  /** The verified session, or `null` for a missing, tampered, expired or wrong-audience cookie. */
  readSession(req: Request): SignupSession | null {
    const claims = this.verify(readCookie(req, SIGNUP_SESSION_COOKIE_NAME), SESSION_AUDIENCE);
    const parsed = SessionClaimsSchema.safeParse(claims);
    if (!parsed.success) return null;
    return { email: parsed.data.email, name: parsed.data.name, googleSub: parsed.data.googleSub };
  }

  clearSession(res: Response): void {
    res.clearCookie(SIGNUP_SESSION_COOKIE_NAME, { ...SIGNUP_COOKIE_OPTIONS, maxAge: undefined });
  }

  issueResendCredential(res: Response, credential: SignupResendCredential): void {
    const token = this.jwt.sign(
      { typ: RESEND_AUDIENCE, ...credential },
      { audience: RESEND_AUDIENCE, expiresIn: SIGNUP_TTL },
    );
    res.cookie(SIGNUP_RESEND_COOKIE_NAME, token, SIGNUP_COOKIE_OPTIONS);
  }

  readResendCredential(req: Request): SignupResendCredential | null {
    const claims = this.verify(readCookie(req, SIGNUP_RESEND_COOKIE_NAME), RESEND_AUDIENCE);
    const parsed = ResendClaimsSchema.safeParse(claims);
    if (!parsed.success) return null;
    return { tenantId: parsed.data.tenantId, email: parsed.data.email };
  }

  private verify(token: string | null, audience: string): unknown {
    if (!token) return null;
    try {
      return this.jwt.verify<object>(token, { audience });
    } catch {
      return null;
    }
  }
}
