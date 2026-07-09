import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
import { mapHotsiteImageFields } from './map-hotsite-image-fields';
import { resolveHotsiteImageUrl } from './resolve-hotsite-image-url';

// Mirror of stripResolvedImageUrls, opposite direction. HotsitePreview renders `draft` directly
// through the M12 public render components (HeroModule, etc.), which pass image fields straight
// into next/image's `src` — that requires an absolute URL or a leading `/`. Walks every image
// field (see resolveHotsiteImageUrl for why raw paths need resolving) so an unsaved upload
// doesn't crash next/image with "Failed to parse src" the moment the admin opens Preview.
//
// `tmpSignedUrls` (optional) maps a tmp/-prefixed (not-yet-promoted) raw path to a private
// signed read URL, fetched by the caller beforehand (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md §
// tmp/ image preview) — a tmp/ path can't resolve via `baseUrl` (the public bucket base) since
// it only exists in the private bucket. A tmp/ path with no entry yet resolves to '' (loading).
export function resolveDraftImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  baseUrl: string,
  tmpSignedUrls?: ReadonlyMap<string, string>,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[] } {
  return mapHotsiteImageFields(branding, layout, (value) => {
    if (value.startsWith('tmp/')) return tmpSignedUrls?.get(value) ?? '';
    return resolveHotsiteImageUrl(value, baseUrl);
  });
}
