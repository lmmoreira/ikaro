import { z } from 'zod';

// Single source of truth for the tmp/ staging path shapes (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
// Booking uploads use tmp/<tenantId>/<uuid>/<fileName> (no purpose segment); hotsite uploads use
// tmp/<tenantId>/<purpose>/<uuid>/<fileName> — one segment longer. The two shapes must stay
// distinguishable: HOTSITE_TMP_PATH_FRAGMENT requires exactly the hotsite segment count so a
// hotsite endpoint can never accept a booking tmp/ upload's path (or vice versa) just because
// both live under the same tmp/<tenantId>/ prefix. Composed into other schemas (e.g. a logoUrl
// field that also accepts an already-permanent path) via string interpolation.
export const HOTSITE_TMP_PATH_FRAGMENT = 'tmp/[^/]+/[^/]+/[^/]+/[^/]+';

/** tmp/<tenantId>/<purpose>/<uuid>/<fileName> — hotsite uploads only. */
export const HOTSITE_TMP_PATH_REGEX = new RegExp(`^${HOTSITE_TMP_PATH_FRAGMENT}$`);

/** tmp/<tenantId>/<uuid>/<fileName> — booking uploads, no purpose segment. */
export const BOOKING_TMP_PHOTO_PATH_REGEX = /^tmp\/[^/]+\/[^/]+\/.+$/;

/**
 * Shared shape for every booking DTO's tmp/ photo-array field (beforeServicePhotoUrls,
 * afterServicePhotoUrls, photoUrls) — compose `.optional()`/`.default([])` on top per field,
 * same as before this was extracted.
 */
export const BookingTmpPhotoPathsSchema = z.array(z.string().regex(BOOKING_TMP_PHOTO_PATH_REGEX));
