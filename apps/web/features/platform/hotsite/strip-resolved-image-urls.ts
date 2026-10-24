import {
  HOTSITE_TEMPLATE_ASSET_PREFIX,
  type HotsiteBrandingResponse,
  type HotsiteModuleResponse,
  type HotsiteSeoResponse,
} from '@ikaro/types';
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
//
// A template's own images are the second shape: platform-owned catalogue objects resolve to
// `.../shared/hotsite-templates/<id>/v<n>/<file>`, which has no tenant marker. Without recovering
// that path too, a draft with a template applied could not be saved at all — the backend rejects
// an absolute URL where it expects a registered catalogue path. Only the tenant's own marker or
// the catalogue marker is ever recovered; another tenant's URL carries neither and stays as is, so
// it is never rewritten into this tenant's prefix.
function extractRawStoragePath(value: string, tenantId: string): string {
  const tenantMarker = `tenants/${tenantId}/`;
  const tenantIndex = value.indexOf(tenantMarker);
  if (tenantIndex !== -1) return value.slice(tenantIndex);
  const catalogueIndex = value.indexOf(HOTSITE_TEMPLATE_ASSET_PREFIX);
  return catalogueIndex === -1 ? value : value.slice(catalogueIndex);
}

export function stripResolvedImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  seo: HotsiteSeoResponse,
  tenantId: string,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[]; seo: HotsiteSeoResponse } {
  return mapHotsiteImageFields(branding, layout, seo, (value) =>
    extractRawStoragePath(value, tenantId),
  );
}
