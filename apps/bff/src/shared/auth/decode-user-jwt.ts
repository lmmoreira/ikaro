import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ACTOR_ROLES } from '@ikaro/types';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

// Exported so JwtStrategy.validate() (features/auth/strategies/jwt.strategy.ts) can reuse the
// same schema instead of re-declaring CurrentUserPayload's shape a second time.
export const CurrentUserPayloadSchema = z.object({
  sub: z.string(),
  tenantId: z.string(),
  tenantSlug: z.string(),
  tenantName: z.string().default(''),
  userName: z.string().nullable().default(null),
  role: z.enum(ACTOR_ROLES),
  locale: z.string().default('pt-BR'),
});

/**
 * Verifies a JWT signature and returns the raw decoded payload, or null if invalid/expired.
 * Schema-agnostic — callers parse the raw payload against their own schema.
 */
export function tryDecodeRawJwt(token: string, secret: string): unknown {
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * Decodes and verifies a Bearer JWT into CurrentUserPayload's shape, or null on any failure
 * (missing/malformed header, invalid signature, expired, wrong shape). For @Public() routes that
 * need to identify an authenticated user manually, since JwtAuthGuard/@CurrentUser() don't run.
 */
export function decodeUserJwt(
  authHeader: string | undefined,
  secret: string,
): CurrentUserPayload | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const raw = tryDecodeRawJwt(token, secret);
  if (!raw) return null;
  const parsed = CurrentUserPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
