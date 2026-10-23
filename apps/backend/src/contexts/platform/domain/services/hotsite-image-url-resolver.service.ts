import {
  GalleryImage,
  HotsiteBranding,
  HotsiteModule,
  HotsiteModuleData,
  HotsiteModulePresentation,
  HotsiteSeo,
  Testimonial,
} from '../hotsite-config.aggregate';

export type ResolveImageUrl = (storagePath: string) => string;

export interface ResolvedHotsiteContent {
  branding: HotsiteBranding;
  layout: HotsiteModule[];
  seo: HotsiteSeo;
}

/**
 * Resolves every stored `filePath` (branding.logoUrl, seo.ogImageUrl, module image fields,
 * GalleryImage.url) to a permanent public URL. Pure — receives the resolution strategy as a
 * callback so the domain layer stays free of storage/infrastructure dependencies. Mirrors the
 * field list traversed by HotsiteImagePathsService.collect().
 */
export class HotsiteImageUrlResolver {
  resolve(
    branding: HotsiteBranding,
    layout: HotsiteModule[],
    seo: HotsiteSeo,
    resolveUrl: ResolveImageUrl,
  ): ResolvedHotsiteContent {
    return {
      branding: { ...branding, logoUrl: this.resolveIfPath(branding.logoUrl, resolveUrl) },
      layout: layout.map((module) => this.resolveModule(module, resolveUrl)),
      seo: { ...seo, ogImageUrl: this.resolveIfPath(seo.ogImageUrl, resolveUrl) },
    };
  }

  private resolveModule(module: HotsiteModule, resolveUrl: ResolveImageUrl): HotsiteModule {
    const data = module.data as Record<string, unknown>;
    const presentation = this.resolvePresentation(module.presentation, resolveUrl);
    return {
      ...module,
      data: this.resolveModuleData(module.type, data, resolveUrl) as HotsiteModuleData,
      ...(presentation === undefined ? {} : { presentation }),
    };
  }

  // The module's own image slots: the three generic fields every module may carry, plus the
  // type-specific collections (testimonial avatars, gallery images, collage-callout images).
  private resolveModuleData(
    type: HotsiteModule['type'],
    data: Record<string, unknown>,
    resolveUrl: ResolveImageUrl,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {
      ...data,
      backgroundImageUrl: this.resolveIfPath(
        data.backgroundImageUrl as string | undefined,
        resolveUrl,
      ),
      imageUrl: this.resolveIfPath(data.imageUrl as string | undefined, resolveUrl),
      avatarUrl: this.resolveIfPath(data.avatarUrl as string | undefined, resolveUrl),
    };

    if (type === 'TESTIMONIALS') resolved.items = this.resolveTestimonialAvatars(data, resolveUrl);
    if (type === 'GALLERY') resolved.images = this.resolveGalleryImageUrls(data, resolveUrl);
    if (type === 'CONTENT_BLOCK' && data.variant === 'collage-callout') {
      resolved.images = this.resolveContentBlockImageUrls(data, resolveUrl);
    }
    return resolved;
  }

  private resolvePresentation(
    presentation: HotsiteModulePresentation | undefined,
    resolveUrl: ResolveImageUrl,
  ): HotsiteModulePresentation | undefined {
    if (presentation?.background === undefined) return presentation;
    return {
      ...presentation,
      background: {
        ...presentation.background,
        imageUrl: this.resolveIfPath(presentation.background.imageUrl, resolveUrl),
      },
    };
  }

  private resolveContentBlockImageUrls(
    data: Record<string, unknown>,
    resolveUrl: ResolveImageUrl,
  ): { url: string; alt?: string }[] {
    const images = (data.images as { url: string; alt?: string }[] | undefined) ?? [];
    return images.map((image) => ({ ...image, url: this.resolveIfPath(image.url, resolveUrl) }));
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

  private resolveIfPath<T extends string | null | undefined>(
    value: T,
    resolveUrl: ResolveImageUrl,
  ): T {
    if (typeof value === 'string' && value.length > 0) {
      return resolveUrl(value) as T;
    }
    return value;
  }
}
