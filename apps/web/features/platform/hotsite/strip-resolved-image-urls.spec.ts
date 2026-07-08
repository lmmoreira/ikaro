import { describe, expect, it } from 'vitest';
import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
import { stripResolvedImageUrls } from './strip-resolved-image-urls';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const RAW_LOGO_PATH = `tenants/${TENANT_ID}/hotsite/branding/abc/logo.png`;
const RESOLVED_LOGO_URL = `https://storage.googleapis.com/ikaro-public/${RAW_LOGO_PATH}`;

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

describe('stripResolvedImageUrls', () => {
  it('strips a resolved logoUrl back to its raw storage path', () => {
    const result = stripResolvedImageUrls(
      makeBranding({ logoUrl: RESOLVED_LOGO_URL }),
      [],
      TENANT_ID,
    );

    expect(result.branding.logoUrl).toBe(RAW_LOGO_PATH);
  });

  it('leaves an empty logoUrl unchanged', () => {
    const result = stripResolvedImageUrls(makeBranding({ logoUrl: '' }), [], TENANT_ID);

    expect(result.branding.logoUrl).toBe('');
  });

  it('leaves an already-raw logoUrl unchanged (idempotent)', () => {
    const result = stripResolvedImageUrls(makeBranding({ logoUrl: RAW_LOGO_PATH }), [], TENANT_ID);

    expect(result.branding.logoUrl).toBe(RAW_LOGO_PATH);
  });

  it('leaves a tmp/ staging path unchanged (no tenant marker to strip, forward-compatible with TD22)', () => {
    const tmpPath = `tmp/${TENANT_ID}/branding/xyz/logo.png`;
    const result = stripResolvedImageUrls(makeBranding({ logoUrl: tmpPath }), [], TENANT_ID);

    expect(result.branding.logoUrl).toBe(tmpPath);
  });

  it('strips a resolved backgroundImageUrl on a HERO module', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/hero/abc/bg.jpg`;
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'HERO',
        enabled: true,
        data: { backgroundImageUrl: `https://storage.googleapis.com/ikaro-public/${rawPath}` },
      },
    ];

    const result = stripResolvedImageUrls(makeBranding(), modules, TENANT_ID);

    expect(result.layout[0].data.backgroundImageUrl).toBe(rawPath);
  });

  it('strips resolved URLs inside GALLERY images array', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/gallery/abc/photo.jpg`;
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'GALLERY',
        enabled: true,
        data: {
          images: [
            { url: `https://storage.googleapis.com/ikaro-public/${rawPath}`, source: 'upload' },
          ],
        },
      },
    ];

    const result = stripResolvedImageUrls(makeBranding(), modules, TENANT_ID);

    expect((result.layout[0].data.images as Array<{ url: string }>)[0].url).toBe(rawPath);
  });

  it('strips resolved avatarUrl inside TESTIMONIALS items array', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/testimonials/abc/avatar.jpg`;
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: {
          items: [
            {
              authorName: 'Maria',
              text: 'Ótimo atendimento!',
              avatarUrl: `https://storage.googleapis.com/ikaro-public/${rawPath}`,
            },
          ],
        },
      },
    ];

    const result = stripResolvedImageUrls(makeBranding(), modules, TENANT_ID);

    expect((result.layout[0].data.items as Array<{ avatarUrl: string }>)[0].avatarUrl).toBe(
      rawPath,
    );
  });

  it('leaves a module with no image fields unchanged', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = stripResolvedImageUrls(makeBranding(), modules, TENANT_ID);

    expect(result.layout[0].data).toEqual(modules[0].data);
  });
});
