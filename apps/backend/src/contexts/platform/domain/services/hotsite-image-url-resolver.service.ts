import {
  GalleryImage,
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  Testimonial,
} from '../hotsite-config.aggregate';

export type ResolveImageUrl = (storagePath: string) => string;

export interface ResolvedHotsiteContent {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
}

/**
 * Resolves every stored `filePath` (branding.logoUrl, module image fields, GalleryImage.url)
 * to a permanent public URL. Pure — receives the resolution strategy as a callback so the
 * domain layer stays free of storage/infrastructure dependencies. Mirrors the field list
 * traversed by HotsiteImagePathsService.collect().
 */
export class HotsiteImageUrlResolver {
  resolve(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    resolveUrl: ResolveImageUrl,
  ): ResolvedHotsiteContent {
    return {
      branding: { ...branding, logoUrl: this.resolveIfPath(branding.logoUrl, resolveUrl) },
      layout: layout.map((module) => this.resolveModule(module, resolveUrl)),
    };
  }

  private resolveModule(module: HotsiteModule, resolveUrl: ResolveImageUrl): HotsiteModule {
    const data = module.data as unknown as Record<string, unknown>;
    const resolved: Record<string, unknown> = {
      ...data,
      backgroundImageUrl: this.resolveIfPath(
        data.backgroundImageUrl as string | undefined,
        resolveUrl,
      ),
      imageUrl: this.resolveIfPath(data.imageUrl as string | undefined, resolveUrl),
      avatarUrl: this.resolveIfPath(data.avatarUrl as string | undefined, resolveUrl),
    };

    if (module.type === 'TESTIMONIALS') {
      resolved.items = this.resolveTestimonialAvatars(data, resolveUrl);
    }
    if (module.type === 'GALLERY') {
      resolved.images = this.resolveGalleryImageUrls(data, resolveUrl);
    }

    return { ...module, data: resolved as unknown as HotsiteModuleData };
  }

  private resolveTestimonialAvatars(
    data: Record<string, unknown>,
    resolveUrl: ResolveImageUrl,
  ): Testimonial[] {
    const items = (data.items as Testimonial[] | undefined) ?? [];
    return items.map((item) => ({
      ...item,
      avatarUrl: this.resolveIfPath(item.avatarUrl, resolveUrl),
    }));
  }

  private resolveGalleryImageUrls(
    data: Record<string, unknown>,
    resolveUrl: ResolveImageUrl,
  ): GalleryImage[] {
    const images = (data.images as GalleryImage[] | undefined) ?? [];
    return images.map((image) => ({ ...image, url: resolveUrl(image.url) }));
  }

  private resolveIfPath<T extends string | undefined>(value: T, resolveUrl: ResolveImageUrl): T {
    if (typeof value === 'string' && value.length > 0) {
      return resolveUrl(value) as T;
    }
    return value;
  }
}
