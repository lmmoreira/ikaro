import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';

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

function stripBrandingImageUrls(
  branding: HotsiteBrandingResponse,
  tenantId: string,
): HotsiteBrandingResponse {
  return { ...branding, logoUrl: extractRawStoragePath(branding.logoUrl, tenantId) };
}

function stripModuleImageUrls(
  module: HotsiteModuleResponse,
  tenantId: string,
): HotsiteModuleResponse {
  const data = module.data;
  const stripped: Record<string, unknown> = { ...data };

  if (typeof data.backgroundImageUrl === 'string') {
    stripped.backgroundImageUrl = extractRawStoragePath(data.backgroundImageUrl, tenantId);
  }
  if (typeof data.imageUrl === 'string') {
    stripped.imageUrl = extractRawStoragePath(data.imageUrl, tenantId);
  }
  if (typeof data.avatarUrl === 'string') {
    stripped.avatarUrl = extractRawStoragePath(data.avatarUrl, tenantId);
  }

  if (module.type === 'TESTIMONIALS' && Array.isArray(data.items)) {
    stripped.items = (data.items as ReadonlyArray<Record<string, unknown>>).map((item) =>
      typeof item.avatarUrl === 'string'
        ? { ...item, avatarUrl: extractRawStoragePath(item.avatarUrl, tenantId) }
        : item,
    );
  }
  if (module.type === 'GALLERY' && Array.isArray(data.images)) {
    stripped.images = (data.images as ReadonlyArray<Record<string, unknown>>).map((image) =>
      typeof image.url === 'string'
        ? { ...image, url: extractRawStoragePath(image.url, tenantId) }
        : image,
    );
  }

  return { ...module, data: stripped };
}

export function stripResolvedImageUrls(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  tenantId: string,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[] } {
  return {
    branding: stripBrandingImageUrls(branding, tenantId),
    layout: layout.map((module) => stripModuleImageUrls(module, tenantId)),
  };
}
