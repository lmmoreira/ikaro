import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME } from '../session-cookie';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload } from '../../../shared/decorators/current-user.decorator';
import { CurrentUserPayloadSchema } from '../../../shared/auth/decode-user-jwt';

const SESSION_COOKIE_REGEX = new RegExp(String.raw`(?:^|;\s*)${SESSION_COOKIE_NAME}=([^;]+)`);

export function extractFromCookie(req: Request): string | null {
  const raw = req?.headers?.cookie ?? '';
  const match = SESSION_COOKIE_REGEX.exec(raw);
  if (!match) return null;
  // decodeURIComponent throws URIError on a malformed percent-escape — the cookie value is
  // client-controlled, so a malformed one must fail auth cleanly, not propagate an uncaught
  // exception (passport-jwt's Strategy.authenticate() calls this extractor with no try/catch).
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      // Cookie must be tried first (TD38 regression, 2026-08-03): since PR #298,
      // ikaro-web attaches `Authorization: Bearer <Cloud-Run-IAM-ID-token>` to every
      // server-side call once BFF_AUTH_MODE=iam (mandatory in staging/prod) — that's a
      // Google-signed token for Cloud Run's own invoker check, not this app's session JWT.
      // With the Bearer extractor first, passport-jwt always grabbed that IAM token instead
      // of the real session cookie and failed verification against JWT_SECRET, 401ing every
      // authenticated request. The httpOnly cookie is the only real transport for the user's
      // session (see CLAUDE.md), so it must win; Bearer is kept only as a fallback for any
      // caller with no cookie available.
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  // Passport only verifies the JWT's signature/expiry before calling validate() — a validly
  // signed token carrying an older/malformed payload shape would otherwise be trusted as-is.
  // Parses against the same schema decode-user-jwt.ts uses for @Public() routes, so both paths
  // agree on what a valid CurrentUserPayload looks like.
  validate(payload: unknown): CurrentUserPayload {
    const parsed = CurrentUserPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid session token');
    }
    return parsed.data;
  }
}
