import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

export const GuestTokenPayloadSchema = z.object({
  bookingId: z.string(),
  tenantId: z.string(),
  contactEmail: z.email(),
});

export type GuestTokenPayload = z.infer<typeof GuestTokenPayloadSchema>;

/**
 * Verifies a JWT signature and returns the raw decoded payload, or null if invalid/expired.
 * Schema-agnostic — use the typed helpers below for guest tokens.
 */
export function tryDecodeRawJwt(token: string, secret: string): unknown {
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * Verifies a guest JWT and returns its typed payload, or false on any failure
 * (invalid signature, expired, missing required fields).
 */
export function verifyGuestToken(token: string, secret: string): GuestTokenPayload | false {
  let raw: unknown;
  try {
    raw = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return false;
  }
  const parsed = GuestTokenPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : false;
}
