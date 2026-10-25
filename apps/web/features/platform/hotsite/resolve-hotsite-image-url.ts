const TMP_PATH_PREFIX = 'tmp/';

// A not-yet-promoted upload lives under tmp/ in the private bucket — it has no public URL and needs
// a private signed read URL instead (see docs/API_CONTRACTS.md § Hotsite Image Preview).
// Centralized here so SingleImageUploadField, GalleryImageManager, HotsitePreview, and
// resolveDraftImageUrls all agree on the same shape check instead of repeating
// `startsWith('tmp/')` independently.
//
// This is the only image-path decision the web makes. A saved image always arrives as a full public
// URL resolved by the backend (docs/API_CONTRACTS.md § Base Standards, "Stored objects"), and the
// web renders it as given — it never composes a public storage URL itself.
export function isTmpImagePath(value: string): boolean {
  return value.startsWith(TMP_PATH_PREFIX);
}
