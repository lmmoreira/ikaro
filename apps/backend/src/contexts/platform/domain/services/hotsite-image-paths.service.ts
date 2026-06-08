import { GalleryImage, HotsiteBranding, HotsiteModule } from '../hotsite-config.aggregate';

export class HotsiteImagePathsService {
  collect(branding: HotsiteBranding, layout: HotsiteModule[]): string[] {
    const paths: string[] = [];
    this.pushIfPath(paths, branding.logoUrl);

    for (const module of layout) {
      this.collectFromModule(paths, module);
    }

    return paths;
  }

  private collectFromModule(paths: string[], module: HotsiteModule): void {
    const data = module.data as unknown as Record<string, unknown>;
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
}
