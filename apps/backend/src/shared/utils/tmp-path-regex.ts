// Single source of truth for the tmp/ staging path shape (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
// Booking uploads use tmp/<tenantId>/<uuid>/<fileName> (no purpose segment); hotsite uploads use
// tmp/<tenantId>/<purpose>/<uuid>/<fileName>. TMP_PATH_FRAGMENT (unanchored) only requires the
// leading tmp/<tenantId>/ shape plus at least one more segment — composed into other schemas
// (e.g. a logoUrl field that also accepts an already-permanent path) via string interpolation.
export const TMP_PATH_FRAGMENT = 'tmp/[^/]+/.+';

/** tmp/<tenantId>/<anything> — hotsite uploads, where the tail shape (purpose/uuid/fileName) varies by purpose. */
export const TMP_PATH_REGEX = new RegExp(`^${TMP_PATH_FRAGMENT}$`);

/** tmp/<tenantId>/<uuid>/<fileName> — booking uploads, no purpose segment. */
export const BOOKING_TMP_PHOTO_PATH_REGEX = /^tmp\/[^/]+\/[^/]+\/.+$/;
