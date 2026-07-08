const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

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
  return `${baseUrl}/${value}`;
}
