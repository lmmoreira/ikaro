import jwt from 'jsonwebtoken';

const GUEST_INFO_REQUEST_TENANT_ID = '00000000-0000-7000-8000-000000000001'; // lavacar-beloauto

export interface MintGuestTokenOptions {
  readonly bookingId: string;
  readonly contactEmail: string;
  readonly tenantId?: string;
  readonly tenantSlug?: string;
  // Override to mint a token with a signature that won't verify against the app's real
  // JWT_SECRET — used to test that a structurally-valid-but-unverifiable token still
  // resolves real tenant branding via decodeUnverifiedTenantSlug() on the invalid-link screen.
  readonly secret?: string;
}

// Mints a guest info-request token identical in shape to buildRespondLink()'s output
// (send-booking-info-requested-notification.use-case.ts), so the E2E test can drive the real
// /bookings/:id/submit-info page without parsing the notification email out of MailHog.
export function mintGuestToken({
  bookingId,
  contactEmail,
  tenantId = GUEST_INFO_REQUEST_TENANT_ID,
  tenantSlug = 'lavacar-beloauto',
  secret = process.env.JWT_SECRET,
}: MintGuestTokenOptions): string {
  if (!secret) {
    throw new Error(
      'JWT_SECRET must be set in the Playwright test environment to mint a guest token',
    );
  }

  return jwt.sign({ bookingId, tenantId, tenantSlug, contactEmail }, secret, {
    expiresIn: 7 * 24 * 60 * 60,
  });
}
