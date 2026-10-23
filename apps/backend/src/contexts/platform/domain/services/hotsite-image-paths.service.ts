import {
  GalleryImage,
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteModulePresentation,
  HotsiteSeo,
} from '../hotsite-config.aggregate';

type ImagePathTransform = (path: string) => string;

export class HotsiteImagePathsService {
  collect(branding: HotsiteBranding, layout: HotsiteModule[], seo: HotsiteSeo): string[] {
    const paths: string[] = [];
    this.pushIfPath(paths, branding.logoUrl);
    this.pushIfPath(paths, seo.ogImageUrl);

    for (const module of layout) {
      this.collectFromModule(paths, module);
    }

    return paths;
  }

  /**
   * Rewrites every image field via `transform`, mirroring `collect()`'s field walk field-for-field
   * (kept in sync with the frontend's `mapHotsiteImageFields`). Used by promotion to swap a
   * `tmp/` path for its permanent one once the corresponding object has actually been copied —
   * `transform` is a pure function, called synchronously; any async validation (existence checks)
   * happens before this is called.
   */
  mapPaths(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    transform: ImagePathTransform,
  ): { branding: HotsiteBranding; layout: HotsiteModule[]; seo: HotsiteSeo } {
    return {
      branding: { ...branding, logoUrl: transform(branding.logoUrl) },
      layout: layout.map((module) => this.mapModule(module, transform)),
      seo: { ...seo, ogImageUrl: transform(seo.ogImageUrl) },
    };
  }

  private mapModule(module: HotsiteModule, transform: ImagePathTransform): HotsiteModule {
    const data = this.asRecord(module.data);
    let mapped = this.mapBaseFields(data, transform);

    if (module.type === 'TESTIMONIALS') mapped = this.mapTestimonialsItems(mapped, data, transform);
    if (module.type === 'GALLERY') mapped = this.mapGalleryImages(mapped, data, transform);
    if (module.type === 'CONTENT_BLOCK')
      mapped = this.mapContentBlockImages(mapped, data, transform);

    const presentation = this.mapPresentation(module.presentation, transform);
    return {
      ...module,
      data: mapped as HotsiteModuleData,
      ...(presentation === undefined ? {} : { presentation }),
    };
  }

  // presentation.background.imageUrl — the section background of a module with no image of its own.
  private mapPresentation(
    presentation: HotsiteModulePresentation | undefined,
    transform: ImagePathTransform,
  ): HotsiteModulePresentation | undefined {
    const imageUrl = presentation?.background?.imageUrl;
    if (presentation?.background === undefined || !imageUrl) return presentation;
    return {
      ...presentation,
      background: { ...presentation.background, imageUrl: transform(imageUrl) },
    };
  }

  // collage-callout's images[].url is the only image slot inside CONTENT_BLOCK.data.
  private mapContentBlockImages(
    mapped: Record<string, unknown>,
    data: Record<string, unknown>,
    transform: ImagePathTransform,
  ): Record<string, unknown> {
    if (data.variant !== 'collage-callout') return mapped;
    const images = (data.images as { url?: string }[] | undefined) ?? [];
    return {
      ...mapped,
      images: images.map((image) => (image.url ? { ...image, url: transform(image.url) } : image)),
    };
  }

  private mapBaseFields(
    data: Record<string, unknown>,
    transform: ImagePathTransform,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = { ...data };
    if (typeof data.backgroundImageUrl === 'string' && data.backgroundImageUrl.length > 0) {
      mapped.backgroundImageUrl = transform(data.backgroundImageUrl);
    }
    if (typeof data.imageUrl === 'string' && data.imageUrl.length > 0) {
      mapped.imageUrl = transform(data.imageUrl);
    }
    if (typeof data.avatarUrl === 'string' && data.avatarUrl.length > 0) {
      mapped.avatarUrl = transform(data.avatarUrl);
    }
    return mapped;
  }

  private mapTestimonialsItems(
    mapped: Record<string, unknown>,
    data: Record<string, unknown>,
    transform: ImagePathTransform,
  ): Record<string, unknown> {
    const items = (data.items as { avatarUrl?: string }[] | undefined) ?? [];
    return {
      ...mapped,
      items: items.map((item) =>
        item.avatarUrl ? { ...item, avatarUrl: transform(item.avatarUrl) } : item,
      ),
    };
  }

  private mapGalleryImages(
    mapped: Record<string, unknown>,
    data: Record<string, unknown>,
    transform: ImagePathTransform,
  ): Record<string, unknown> {
    const images = (data.images as GalleryImage[] | undefined) ?? [];
    return {
      ...mapped,
      images: images.map((image) => (image.url ? { ...image, url: transform(image.url) } : image)),
    };
  }

  private collectFromModule(paths: string[], module: HotsiteModule): void {
    const data = this.asRecord(module.data);
    this.pushIfPath(paths, data.backgroundImageUrl);
    this.pushIfPath(paths, data.imageUrl);
    this.pushIfPath(paths, data.avatarUrl);

    if (module.type === 'TESTIMONIALS') {
      const items = (data.items as { avatarUrl?: string }[] | undefined) ?? [];
      for (const item of items) this.pushIfPath(paths, item.avatarUrl);
    }

    if (module.type === 'GALLERY') {
      const images = (data.images as GalleryImage[] | undefined) ?? [];
      for (const image of images) this.pushIfPath(paths, image.url);
    }

    if (module.type === 'CONTENT_BLOCK' && data.variant === 'collage-callout') {
      const images = (data.images as { url?: string }[] | undefined) ?? [];
      for (const image of images) this.pushIfPath(paths, image.url);
    }

    this.pushIfPath(paths, module.presentation?.background?.imageUrl);
  }

  private pushIfPath(paths: string[], value: unknown): void {
    if (typeof value === 'string' && value.length > 0) paths.push(value);
  }

  // HotsiteModuleData is a union of specific per-type interfaces with no index signature —
  // this is the one place that widens it for generic field probing, since Zod validates
  // `data` as a plain record and the per-module-type shape isn't statically derivable from it.
  private asRecord(data: HotsiteModuleData): Record<string, unknown> {
    return data as unknown as Record<string, unknown>;
  }
}
