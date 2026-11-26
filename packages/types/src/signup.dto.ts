// Public self-signup contract (UC-127, UC-128). The backend owns every verdict; the BFF forwards it.

/** Why a slug is `invalid` (UC-128). The web translates it; the API returns no display text. */
export type SlugInvalidReason = 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'INVALID_HYPHEN';

/** `GET /v1/public/signup/slug-availability?slug=`. Never carries a tenant field. */
export type SlugAvailabilityResponse =
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'reserved' }
  | { status: 'invalid'; reason: SlugInvalidReason };

/** `GET /v1/public/signup/session`: the verified Google identity of the in-progress signup (UC-127). */
export interface SignupSessionResponse {
  email: string;
  name: string;
  /** False when an earlier self-signup tenant of this Google account never paid (UC-127 A3). */
  trialAvailable: boolean;
  /** The earliest unpaid tenant of this Google account, so the page can offer sign-in. */
  existingTenantSlug?: string;
  /** The Terms version the visitor must accept and send back as `acceptedTermsVersion`. */
  termsVersion: string;
}

/** `POST /v1/public/signup/tenant` `201`: the tenant exists and the first manager gets an email. */
export interface SignupTenantResponse {
  tenantSlug: string;
  nextPath: string;
}
