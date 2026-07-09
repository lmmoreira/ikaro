import {
  GalleryImage,
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
} from '../hotsite-config.aggregate';

type ImagePathTransform = (path: string) => string;

export class HotsiteImagePathsService {
  collect(branding: HotsiteBranding, layout: HotsiteModule[]): string[] {
    const paths: string[] = [];
    this.pushIfPath(paths, branding.logoUrl);

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
    transform: ImagePathTransform,
  ): { branding: HotsiteBranding; layout: HotsiteModule[] } {
    return {
      branding: { ...branding, logoUrl: transform(branding.logoUrl) },
      layout: layout.map((module) => this.mapModule(module, transform)),
    };
  }

  private mapModule(module: HotsiteModule, transform: ImagePathTransform): HotsiteModule {
    const data = this.asRecord(module.data);
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

    if (module.type === 'TESTIMONIALS') {
      const items = (data.items as { avatarUrl?: string }[] | undefined) ?? [];
      mapped.items = items.map((item) =>
        item.avatarUrl ? { ...item, avatarUrl: transform(item.avatarUrl) } : item,
      );
    }

    if (module.type === 'GALLERY') {
      const images = (data.images as GalleryImage[] | undefined) ?? [];
      mapped.images = images.map((image) =>
        image.url ? { ...image, url: transform(image.url) } : image,
      );
    }

    return { ...module, data: mapped as HotsiteModuleData };
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
