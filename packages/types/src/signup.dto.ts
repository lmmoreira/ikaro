// Public self-signup contract (UC-127, UC-128). The backend owns every verdict; the BFF forwards it.

/** Why a slug is `invalid` (UC-128). The web translates it; the API returns no display text. */
export type SlugInvalidReason = 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARACTERS' | 'INVALID_HYPHEN';

/** `GET /v1/public/signup/slug-availability?slug=`. Never carries a tenant field. */
export type SlugAvailabilityResponse =
  | { status: 'available' }
  | { status: 'taken' }
  | { status: 'reserved' }
  | { status: 'invalid'; reason: SlugInvalidReason };
