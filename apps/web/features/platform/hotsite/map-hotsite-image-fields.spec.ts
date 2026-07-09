import { describe, expect, it } from 'vitest';
import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
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

describe('collectHotsiteImagePaths', () => {
  it('returns [] when branding has no logo and layout has no image fields', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    expect(collectHotsiteImagePaths(makeBranding(), modules)).toEqual([]);
  });

  it('collects the branding logoUrl when present', () => {
    const branding = makeBranding({ logoUrl: 'tmp/tenant-1/branding/u1/logo.png' });

    expect(collectHotsiteImagePaths(branding, [])).toEqual(['tmp/tenant-1/branding/u1/logo.png']);
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

    expect(collectHotsiteImagePaths(makeBranding(), modules)).toEqual([
      'tmp/tenant-1/hero/u1/bg.jpg',
      'tmp/tenant-1/testimonials/u1/m.jpg',
      'tenants/tenant-1/hotsite/gallery/u1/photo.jpg',
    ]);
  });
});
