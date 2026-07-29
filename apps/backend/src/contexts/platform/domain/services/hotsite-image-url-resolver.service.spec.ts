import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteModule,
} from '../hotsite-config.aggregate';
import { HotsiteImageUrlResolver } from './hotsite-image-url-resolver.service';

// Direct unit coverage for the field-walk this class performs — previously only exercised
// indirectly via hotsite-content-reader.service.spec.ts (Codex review follow-up, PR #291).
describe('HotsiteImageUrlResolver', () => {
  let resolver: HotsiteImageUrlResolver;
  const toPublicUrl: (path: string) => string = (path) => `https://cdn.example.com/${path}`;

  beforeEach(() => {
    resolver = new HotsiteImageUrlResolver();
  });

  it('leaves an empty branding.logoUrl and seo.ogImageUrl unresolved', () => {
    const result = resolver.resolve(DEFAULT_HOTSITE_BRANDING, [], DEFAULT_HOTSITE_SEO, toPublicUrl);

    expect(result.branding.logoUrl).toBe('');
    expect(result.seo.ogImageUrl).toBe('');
  });

  it('resolves branding.logoUrl to a public URL when present', () => {
    const branding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/t1/hotsite/branding/u1/logo.png',
    };

    const result = resolver.resolve(branding, [], DEFAULT_HOTSITE_SEO, toPublicUrl);

    expect(result.branding.logoUrl).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/branding/u1/logo.png',
    );
  });

  it('resolves seo.ogImageUrl to a public URL when present, same as branding.logoUrl', () => {
    const seo = { ...DEFAULT_HOTSITE_SEO, ogImageUrl: 'tenants/t1/hotsite/seo-og-image/u1/og.png' };

    const result = resolver.resolve(DEFAULT_HOTSITE_BRANDING, [], seo, toPublicUrl);

    expect(result.seo.ogImageUrl).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/seo-og-image/u1/og.png',
    );
  });

  it('resolves backgroundImageUrl and imageUrl on module data', () => {
    const layout: HotsiteModule[] = [
      {
        type: 'HERO',
        enabled: true,
        data: {
          variant: 'centered',
          title: 'Title',
          backgroundImageUrl: 'tenants/t1/hotsite/hero/u1/bg.jpg',
          ctaLabel: 'Book',
          ctaTarget: 'booking-form',
        },
      },
      {
        type: 'ABOUT',
        enabled: true,
        data: {
          title: 'About',
          body: 'Text',
          imageUrl: 'tenants/t1/hotsite/about/u1/photo.jpg',
          imagePosition: 'left',
        },
      },
    ];

    const result = resolver.resolve(
      DEFAULT_HOTSITE_BRANDING,
      layout,
      DEFAULT_HOTSITE_SEO,
      toPublicUrl,
    );

    expect((result.layout[0].data as { backgroundImageUrl?: string }).backgroundImageUrl).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/hero/u1/bg.jpg',
    );
    expect((result.layout[1].data as { imageUrl?: string }).imageUrl).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/about/u1/photo.jpg',
    );
  });

  it('resolves each TESTIMONIALS item avatarUrl, leaving items without one untouched', () => {
    const layout: HotsiteModule[] = [
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: {
          items: [
            {
              authorName: 'Maria',
              text: 'Ótimo!',
              avatarUrl: 'tenants/t1/hotsite/testimonials/u1/maria.jpg',
            },
            { authorName: 'João', text: 'Excelente!' },
          ],
          layout: 'grid',
        },
      },
    ];

    const result = resolver.resolve(
      DEFAULT_HOTSITE_BRANDING,
      layout,
      DEFAULT_HOTSITE_SEO,
      toPublicUrl,
    );

    const items = (result.layout[0].data as { items: { avatarUrl?: string }[] }).items;
    expect(items[0].avatarUrl).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/testimonials/u1/maria.jpg',
    );
    expect(items[1].avatarUrl).toBeUndefined();
  });

  it('resolves GALLERY image urls uniformly regardless of source, preserving the rest of each image object', () => {
    const layout: HotsiteModule[] = [
      {
        type: 'GALLERY',
        enabled: true,
        data: {
          images: [
            { url: 'tenants/t1/hotsite/gallery/u1/photo.jpg', source: 'upload' },
            {
              url: 'tenants/t1/hotsite/gallery/u2/featured.jpg',
              source: 'booking',
              bookingId: 'b1',
              photoType: 'after',
            },
          ],
          layout: 'grid',
          maxVisible: 6,
        },
      },
    ];

    const result = resolver.resolve(
      DEFAULT_HOTSITE_BRANDING,
      layout,
      DEFAULT_HOTSITE_SEO,
      toPublicUrl,
    );

    const images = (result.layout[0].data as { images: { url: string; bookingId?: string }[] })
      .images;
    expect(images[0].url).toBe('https://cdn.example.com/tenants/t1/hotsite/gallery/u1/photo.jpg');
    expect(images[1].url).toBe(
      'https://cdn.example.com/tenants/t1/hotsite/gallery/u2/featured.jpg',
    );
    expect(images[1].bookingId).toBe('b1');
  });

  it('does not mutate the input branding/layout/seo', () => {
    const branding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/t1/hotsite/branding/u1/logo.png',
    };
    const seo = { ...DEFAULT_HOTSITE_SEO, ogImageUrl: 'tenants/t1/hotsite/seo-og-image/u1/og.png' };
    const layout: HotsiteModule[] = [
      {
        type: 'ABOUT',
        enabled: true,
        data: {
          title: 'About',
          body: 'Text',
          imageUrl: 'tenants/t1/hotsite/about/u1/p.jpg',
          imagePosition: 'left',
        },
      },
    ];

    resolver.resolve(branding, layout, seo, toPublicUrl);

    expect(branding.logoUrl).toBe('tenants/t1/hotsite/branding/u1/logo.png');
    expect(seo.ogImageUrl).toBe('tenants/t1/hotsite/seo-og-image/u1/og.png');
    expect((layout[0].data as { imageUrl?: string }).imageUrl).toBe(
      'tenants/t1/hotsite/about/u1/p.jpg',
    );
  });
});
