import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';

type ImageUrlTransform = (value: string) => string;

function transformModule(
  module: HotsiteModuleResponse,
  transform: ImageUrlTransform,
): HotsiteModuleResponse {
  const data = module.data;
  const mapped: Record<string, unknown> = { ...data };

  if (typeof data.backgroundImageUrl === 'string') {
    mapped.backgroundImageUrl = transform(data.backgroundImageUrl);
  }
  if (typeof data.imageUrl === 'string') {
    mapped.imageUrl = transform(data.imageUrl);
  }
  if (typeof data.avatarUrl === 'string') {
    mapped.avatarUrl = transform(data.avatarUrl);
  }

  if (module.type === 'TESTIMONIALS' && Array.isArray(data.items)) {
    mapped.items = (data.items as ReadonlyArray<Record<string, unknown>>).map((item) =>
      typeof item.avatarUrl === 'string' ? { ...item, avatarUrl: transform(item.avatarUrl) } : item,
    );
  }
  if (module.type === 'GALLERY' && Array.isArray(data.images)) {
    mapped.images = (data.images as ReadonlyArray<Record<string, unknown>>).map((image) =>
      typeof image.url === 'string' ? { ...image, url: transform(image.url) } : image,
    );
  }

  return { ...module, data: mapped };
}

// Walks every image field this codebase resolves/collects for a hotsite config — mirrors
// HotsiteImagePathsService.collect() (backend) field-for-field. Shared by
// strip-resolved-image-urls.ts (URL -> raw path, for PATCH) and resolve-draft-image-urls.ts
// (raw path -> URL, for rendering an unsaved draft), so a new image field only needs adding here
// once, not once per direction.
export function mapHotsiteImageFields(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  transform: ImageUrlTransform,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[] } {
  return {
    branding: { ...branding, logoUrl: transform(branding.logoUrl) },
    layout: layout.map((module) => transformModule(module, transform)),
  };
}

// Read-only twin of mapHotsiteImageFields — returns every non-empty image path instead of
// rewriting them. Used to find tmp/-prefixed (not-yet-promoted) paths that need a private
// signed-read URL before rendering (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
export function collectHotsiteImagePaths(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
): string[] {
  const paths: string[] = [];
  mapHotsiteImageFields(branding, layout, (value) => {
    if (value) paths.push(value);
    return value;
  });
  return paths;
}
