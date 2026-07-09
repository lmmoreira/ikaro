import { DEFAULT_HOTSITE_BRANDING, HotsiteModule } from '../hotsite-config.aggregate';
import { HotsiteImagePathsService } from './hotsite-image-paths.service';

describe('HotsiteImagePathsService', () => {
  let svc: HotsiteImagePathsService;

  beforeEach(() => {
    svc = new HotsiteImagePathsService();
  });

  it('returns [] when branding has no logo and layout has no image fields', () => {
    const layout: HotsiteModule[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    expect(svc.collect(DEFAULT_HOTSITE_BRANDING, layout)).toEqual([]);
  });

  it('collects the branding logoUrl when present', () => {
    const branding = {
      ...DEFAULT_HOTSITE_BRANDING,
      logoUrl: 'tenants/t1/hotsite/branding/u1/logo.png',
    };

    expect(svc.collect(branding, [])).toEqual(['tenants/t1/hotsite/branding/u1/logo.png']);
  });

  it('collects backgroundImageUrl, imageUrl and avatarUrl from generic module data fields', () => {
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

    expect(svc.collect(DEFAULT_HOTSITE_BRANDING, layout)).toEqual([
      'tenants/t1/hotsite/hero/u1/bg.jpg',
      'tenants/t1/hotsite/about/u1/photo.jpg',
    ]);
  });

  it('collects each TESTIMONIALS item avatarUrl', () => {
    const layout: HotsiteModule[] = [
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: {
          items: [
            {
              authorName: 'Maria',
              text: 'Ótimo!',
              avatarUrl: 'tenants/t1/hotsite/gallery/u1/maria.jpg',
            },
            { authorName: 'João', text: 'Excelente!' },
          ],
          layout: 'grid',
        },
      },
    ];

    expect(svc.collect(DEFAULT_HOTSITE_BRANDING, layout)).toEqual([
      'tenants/t1/hotsite/gallery/u1/maria.jpg',
    ]);
  });

  it('collects GALLERY image urls uniformly regardless of source — upload and booking alike', () => {
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

    expect(svc.collect(DEFAULT_HOTSITE_BRANDING, layout)).toEqual([
      'tenants/t1/hotsite/gallery/u1/photo.jpg',
      'tenants/t1/hotsite/gallery/u2/featured.jpg',
    ]);
  });

  describe('mapPaths()', () => {
    const upper: (path: string) => string = (path) => path.toUpperCase();

    it('rewrites the branding logoUrl', () => {
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: 'tmp/t1/branding/u1/logo.png' };

      const result = svc.mapPaths(branding, [], upper);

      expect(result.branding.logoUrl).toBe('TMP/T1/BRANDING/U1/LOGO.PNG');
    });

    it('rewrites backgroundImageUrl and imageUrl on module data', () => {
      const layout: HotsiteModule[] = [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Title',
            backgroundImageUrl: 'tmp/t1/hero/u1/bg.jpg',
            ctaLabel: 'Book',
            ctaTarget: 'booking-form',
          },
        },
      ];

      const result = svc.mapPaths(DEFAULT_HOTSITE_BRANDING, layout, upper);

      expect((result.layout[0].data as { backgroundImageUrl?: string }).backgroundImageUrl).toBe(
        'TMP/T1/HERO/U1/BG.JPG',
      );
    });

    it('rewrites each TESTIMONIALS item avatarUrl, leaving items without one untouched', () => {
      const layout: HotsiteModule[] = [
        {
          type: 'TESTIMONIALS',
          enabled: true,
          data: {
            items: [
              { authorName: 'Maria', text: 'Ótimo!', avatarUrl: 'tmp/t1/testimonials/u1/m.jpg' },
              { authorName: 'João', text: 'Excelente!' },
            ],
            layout: 'grid',
          },
        },
      ];

      const result = svc.mapPaths(DEFAULT_HOTSITE_BRANDING, layout, upper);

      const items = (result.layout[0].data as { items: { avatarUrl?: string }[] }).items;
      expect(items[0].avatarUrl).toBe('TMP/T1/TESTIMONIALS/U1/M.JPG');
      expect(items[1].avatarUrl).toBeUndefined();
    });

    it('rewrites GALLERY image urls, preserving the rest of each image object', () => {
      const layout: HotsiteModule[] = [
        {
          type: 'GALLERY',
          enabled: true,
          data: {
            images: [
              { url: 'tmp/t1/gallery/u1/photo.jpg', source: 'upload' },
              {
                url: 'tenants/t1/hotsite/gallery/u2/featured.jpg',
                source: 'booking',
                bookingId: 'b1',
              },
            ],
            layout: 'grid',
            maxVisible: 6,
          },
        },
      ];

      const result = svc.mapPaths(DEFAULT_HOTSITE_BRANDING, layout, upper);

      const images = (result.layout[0].data as { images: { url: string; bookingId?: string }[] })
        .images;
      expect(images[0].url).toBe('TMP/T1/GALLERY/U1/PHOTO.JPG');
      expect(images[1].url).toBe('TENANTS/T1/HOTSITE/GALLERY/U2/FEATURED.JPG');
      expect(images[1].bookingId).toBe('b1');
    });

    it('does not mutate the input branding/layout', () => {
      const branding = { ...DEFAULT_HOTSITE_BRANDING, logoUrl: 'tmp/t1/branding/u1/logo.png' };
      const layout: HotsiteModule[] = [
        {
          type: 'ABOUT',
          enabled: true,
          data: {
            title: 'About',
            body: 'Text',
            imageUrl: 'tmp/t1/about/u1/p.jpg',
            imagePosition: 'left',
          },
        },
      ];

      svc.mapPaths(branding, layout, upper);

      expect(branding.logoUrl).toBe('tmp/t1/branding/u1/logo.png');
      expect((layout[0].data as { imageUrl?: string }).imageUrl).toBe('tmp/t1/about/u1/p.jpg');
    });
  });
});
