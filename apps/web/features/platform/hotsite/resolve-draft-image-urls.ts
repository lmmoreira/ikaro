import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { mapHotsiteImageFields } from './map-hotsite-image-fields';
import { isTmpImagePath } from './resolve-hotsite-image-url';

// Mirror of stripResolvedImageUrls, opposite direction. HotsitePreview renders `draft` directly
// through the M12 public render components (HeroModule, etc.), which pass image fields straight
// into next/image's `src` — that requires an absolute URL or a leading `/`. A saved image already
// arrives as a full public URL (the backend resolves it); the one value that is not is a
// not-yet-promoted upload, so this walks every image field and swaps only those, so an unsaved
// upload doesn't crash next/image with "Failed to parse src" the moment the admin opens Preview.
//
// `tmpSignedUrls` (optional) maps a tmp/-prefixed (not-yet-promoted) raw path to a private
// signed read URL, fetched by the caller beforehand (see docs/API_CONTRACTS.md §
// tmp/ image preview) — a tmp/ path only exists in the private bucket. A tmp/ path with no entry
// yet resolves to '' (loading).
// One image field's resolution, shared with the sharing simulation (a single `seo.ogImageUrl`).
export function resolveDraftImageUrl(
  value: string,
  tmpSignedUrls?: ReadonlyMap<string, string>,
): string {
  if (isTmpImagePath(value)) return tmpSignedUrls?.get(value) ?? '';
  return value;
}

export function resolveDraftImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  seo: HotsiteSeoResponse,
  tmpSignedUrls?: ReadonlyMap<string, string>,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[]; seo: HotsiteSeoResponse } {
  return mapHotsiteImageFields(branding, layout, seo, (value) =>
    resolveDraftImageUrl(value, tmpSignedUrls),
  );
}
