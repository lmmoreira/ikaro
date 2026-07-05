import jwt from 'jsonwebtoken';
import { z } from 'zod';

const GuestTokenPayloadSchema = z.object({
  bookingId: z.string(),
  tenantId: z.string(),
  tenantSlug: z.string().optional(),
  contactEmail: z.email(),
});

export type GuestTokenPayload = z.infer<typeof GuestTokenPayloadSchema>;

// Verifies the signature + expiry of a guest info-request token minted by
// send-booking-info-requested-notification.use-case.ts. This check only decides what to
// render (form vs. invalid-link screen) — the BFF independently re-verifies the same token
// when the guest submits, so this is not a second authorization boundary.
export function verifyGuestToken(token: string): GuestTokenPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  let raw: unknown;
  try {
    raw = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  const parsed = GuestTokenPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
