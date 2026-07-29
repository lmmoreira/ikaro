import { describe, expect, it } from 'vitest';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { collectHotsiteImagePaths } from './map-hotsite-image-fields';

function makeBranding(overrides: Partial<HotsiteBrandingResponse> = {}): HotsiteBrandingResponse {
  return {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
    ...overrides,
  };
}

function makeSeo(overrides: Partial<HotsiteSeoResponse> = {}): HotsiteSeoResponse {
  return { title: null, description: null, ogImageUrl: '', ...overrides };
}

describe('collectHotsiteImagePaths', () => {
  it('returns [] when branding has no logo and layout has no image fields', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    expect(collectHotsiteImagePaths(makeBranding(), modules, makeSeo())).toEqual([]);
  });

  it('collects the branding logoUrl when present', () => {
    const branding = makeBranding({ logoUrl: 'tmp/tenant-1/branding/u1/logo.png' });

    expect(collectHotsiteImagePaths(branding, [], makeSeo())).toEqual([
      'tmp/tenant-1/branding/u1/logo.png',
    ]);
  });

  it('collects the seo ogImageUrl when present', () => {
    const seo = makeSeo({ ogImageUrl: 'tmp/tenant-1/seo-og-image/u1/og-image.png' });

    expect(collectHotsiteImagePaths(makeBranding(), [], seo)).toEqual([
      'tmp/tenant-1/seo-og-image/u1/og-image.png',
    ]);
  });

  it('collects backgroundImageUrl, imageUrl, TESTIMONIALS avatarUrl, and GALLERY image urls', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'HERO',
        enabled: true,
        data: { backgroundImageUrl: 'tmp/tenant-1/hero/u1/bg.jpg' },
      },
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: {
          items: [
            {
              authorName: 'Maria',
              text: 'Ótimo!',
              avatarUrl: 'tmp/tenant-1/testimonials/u1/m.jpg',
            },
            { authorName: 'João', text: 'Excelente!' },
          ],
        },
      },
      {
        type: 'GALLERY',
        enabled: true,
        data: {
          images: [{ url: 'tenants/tenant-1/hotsite/gallery/u1/photo.jpg', source: 'upload' }],
        },
      },
    ];

    expect(collectHotsiteImagePaths(makeBranding(), modules, makeSeo())).toEqual([
      'tmp/tenant-1/hero/u1/bg.jpg',
      'tmp/tenant-1/testimonials/u1/m.jpg',
      'tenants/tenant-1/hotsite/gallery/u1/photo.jpg',
    ]);
  });
});
