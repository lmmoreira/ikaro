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
          ctaTarget: 'booking',
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
});
