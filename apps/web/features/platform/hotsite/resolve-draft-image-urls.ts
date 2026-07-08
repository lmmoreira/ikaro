import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
import { mapHotsiteImageFields } from './map-hotsite-image-fields';
import { resolveHotsiteImageUrl } from './resolve-hotsite-image-url';

// Mirror of stripResolvedImageUrls, opposite direction. HotsitePreview renders `draft` directly
// through the M12 public render components (HeroModule, etc.), which pass image fields straight
// into next/image's `src` — that requires an absolute URL or a leading `/`. Walks every image
// field (see resolveHotsiteImageUrl for why raw paths need resolving) so an unsaved upload
// doesn't crash next/image with "Failed to parse src" the moment the admin opens Preview.
export function resolveDraftImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  baseUrl: string,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[] } {
  return mapHotsiteImageFields(branding, layout, (value) => resolveHotsiteImageUrl(value, baseUrl));
}
