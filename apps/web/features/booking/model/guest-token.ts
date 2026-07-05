import 'server-only';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

// Mirrors the backend's Slug value object (apps/backend/src/shared/value-objects/slug.vo.ts).
const SLUG_PATTERN = /^[a-z0-9-]+$/;

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

// Decodes tenantSlug WITHOUT verifying the signature — used only to pick which tenant's
// public hotsite branding skins the invalid-link screen when the token fails full
// verification (expired, tampered, or predates M13-S38's tenantSlug payload field). Safe
// specifically because hotsite branding is already public, unauthenticated data (served at
// GET /platform/manifest/:slug for anyone) — an unverified claim here can only select which
// harmless color scheme renders, never grant access to booking data or a write action.
// The SLUG_PATTERN check is still required: this value is later interpolated into a fetch
// URL and rendered as an href, so an unvalidated string here would be an open-redirect /
// path-injection vector even though the claim itself carries no authorization weight.
export function decodeUnverifiedTenantSlug(token: string): string | null {
  let raw: unknown;
  try {
    raw = jwt.decode(token);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;

  const { tenantSlug } = raw as Record<string, unknown>;
  return typeof tenantSlug === 'string' && SLUG_PATTERN.test(tenantSlug) ? tenantSlug : null;
}
