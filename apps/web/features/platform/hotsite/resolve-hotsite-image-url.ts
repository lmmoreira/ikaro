const ABSOLUTE_URL_PATTERN = /^https?:\/\//;
const TMP_PATH_PREFIX = 'tmp/';

// A not-yet-promoted upload lives under tmp/ in the private bucket — it can't resolve via the
// public-bucket string template (resolveHotsiteImageUrl) and needs a private signed read URL
// instead (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview). Centralized here so
// SingleImageUploadField, GalleryImageManager, HotsitePreview, and resolveDraftImageUrls all
// agree on the same shape check instead of repeating `startsWith('tmp/')` independently.
export function isTmpImagePath(value: string): boolean {
  return value.startsWith(TMP_PATH_PREFIX);
}

// Every hotsite image field is a raw `tenants/<id>/hotsite/...` storage path immediately after
// upload (SingleImageUploadField/GalleryImageManager's onChange(filePath)) — resolution to a
// full public URL only happens server-side, on the next GET. Until that GET happens (unsaved
// draft, or an upload-field preview right after upload), any `<img src>`/`next/image` consumer
// needs an absolute URL, not the raw path. This resolves any non-absolute value against
// `baseUrl` (NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL — the same public bucket base the backend's
// GCS_PUBLIC_BASE_URL/GCS_PUBLIC_BUCKET_NAME resolve against). A value that's already absolute
// (loaded via a prior GET, untouched this session) or empty passes through unchanged.
export function resolveHotsiteImageUrl(value: string, baseUrl: string): string {
  if (value === '' || ABSOLUTE_URL_PATTERN.test(value)) return value;
  return `${baseUrl.replace(/\/$/, '')}/${value}`;
}

// Owns the NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL read so SingleImageUploadField, GalleryImageManager,
// and HotsitePreview don't each independently read process.env — a typo or rename in one call site
// would otherwise silently break image resolution only there, with no compile-time signal.
// resolveDraftImageUrls keeps taking baseUrl as an explicit, testable parameter rather than
// reading env itself — HotsitePreview (its only caller) passes hotsiteImageBaseUrl() in.
export function hotsiteImageBaseUrl(): string {
  return process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL ?? '';
}

export function resolveHotsiteImageDisplayUrl(value: string): string {
  return resolveHotsiteImageUrl(value, hotsiteImageBaseUrl());
}
