import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
import { mapHotsiteImageFields } from './map-hotsite-image-fields';

// GET resolves every stored image field to a full public URL (HotsiteImageUrlResolver,
// backend) via a plain `${publicBaseUrl}/${publicBucketName}/${storagePath}` concatenation —
// deterministic, not signed/expiring. PATCH requires the raw `tenants/<tenantId>/...` storage
// path instead (HotsiteImagePathsService.collect() / verifyImagesExist). Rather than tracking
// which fields the admin touched this session — layout's per-module `data` is replaced wholesale
// on save (see UpdateHotsiteContentUseCase.toDomainLayout), not merged field-by-field, so omitting
// an untouched field would delete the image reference instead of preserving it — this recovers the
// raw path directly from the resolved URL by locating the tenant-prefixed segment. A value that
// doesn't contain that segment (a fresh tmp/ or tenants/ upload, or an empty logoUrl) passes
// through unchanged, so this is safe to apply unconditionally to every field, changed or not.
function extractRawStoragePath(value: string, tenantId: string): string {
  const marker = `tenants/${tenantId}/`;
  const index = value.indexOf(marker);
  return index === -1 ? value : value.slice(index);
}

export function stripResolvedImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  tenantId: string,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[] } {
  return mapHotsiteImageFields(branding, layout, (value) => extractRawStoragePath(value, tenantId));
}
