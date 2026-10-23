import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';

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

  // collage-callout's images[].url is the only image slot inside CONTENT_BLOCK.data.
  if (
    module.type === 'CONTENT_BLOCK' &&
    data.variant === 'collage-callout' &&
    Array.isArray(data.images)
  ) {
    mapped.images = (data.images as ReadonlyArray<Record<string, unknown>>).map((image) =>
      typeof image.url === 'string' ? { ...image, url: transform(image.url) } : image,
    );
  }

  // presentation.background.imageUrl — the section backdrop of a module with no image of its own.
  const presentation = transformPresentation(module.presentation, transform);
  return { ...module, data: mapped, ...(presentation ? { presentation } : {}) };
}

function transformPresentation(
  presentation: HotsiteModuleResponse['presentation'],
  transform: ImageUrlTransform,
): HotsiteModuleResponse['presentation'] {
  const imageUrl = presentation?.background?.imageUrl;
  if (!presentation?.background || typeof imageUrl !== 'string') return presentation;
  return {
    ...presentation,
    background: { ...presentation.background, imageUrl: transform(imageUrl) },
  };
}

// Walks every image field this codebase resolves/collects for a hotsite config — mirrors
// HotsiteImagePathsService.collect() (backend) field-for-field (the shared table in
// @ikaro/types/testing/hotsite-module-contract is run through both). Shared by
// strip-resolved-image-urls.ts (URL -> raw path, for PATCH) and resolve-draft-image-urls.ts
// (raw path -> URL, for rendering an unsaved draft), so a new image field only needs adding here
// once, not once per direction.
export function mapHotsiteImageFields(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  seo: HotsiteSeoResponse,
  transform: ImageUrlTransform,
): { branding: HotsiteBrandingResponse; layout: HotsiteModuleResponse[]; seo: HotsiteSeoResponse } {
  return {
    branding: { ...branding, logoUrl: transform(branding.logoUrl) },
    layout: layout.map((module) => transformModule(module, transform)),
    seo: { ...seo, ogImageUrl: transform(seo.ogImageUrl) },
  };
}

// Read-only twin of mapHotsiteImageFields — returns every non-empty image path instead of
// rewriting them. Used to find tmp/-prefixed (not-yet-promoted) paths that need a private
// signed-read URL before rendering (see docs/API_CONTRACTS.md § Hotsite Image Preview).
export function collectHotsiteImagePaths(
  branding: HotsiteBrandingResponse,
  layout: readonly HotsiteModuleResponse[],
  seo: HotsiteSeoResponse,
): string[] {
  const paths: string[] = [];
  mapHotsiteImageFields(branding, layout, seo, (value) => {
    if (value) paths.push(value);
    return value;
  });
  return paths;
}
