import { describe, expect, it } from 'vitest';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { resolveDraftImageUrl, resolveDraftImageUrls } from './resolve-draft-image-urls';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const RESOLVED_LOGO_URL = `https://img.example.test/public/tenants/${TENANT_ID}/hotsite/branding/abc/logo.png`;
const TMP_LOGO_PATH = 'tmp/tenant-1/branding/u1/logo.png';
const SIGNED_URL = 'https://storage.example.com/signed-read?sig=abc';

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

describe('resolveDraftImageUrls', () => {
  it('leaves an already-resolved absolute URL exactly as the backend returned it', () => {
    const result = resolveDraftImageUrls(
      makeBranding({ logoUrl: RESOLVED_LOGO_URL }),
      [],
      makeSeo(),
    );

    expect(result.branding.logoUrl).toBe(RESOLVED_LOGO_URL);
  });

  it('leaves an empty logoUrl unchanged', () => {
    const result = resolveDraftImageUrls(makeBranding({ logoUrl: '' }), [], makeSeo());

    expect(result.branding.logoUrl).toBe('');
  });

  it('leaves resolved URLs in module image fields unchanged (HERO background, GALLERY, TESTIMONIALS)', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'HERO',
        enabled: true,
        data: { backgroundImageUrl: 'https://img.example.test/public/hero.png' },
      },
      {
        type: 'GALLERY',
        enabled: true,
        data: { images: [{ url: 'https://img.example.test/public/photo.jpg', source: 'upload' }] },
      },
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: {
          items: [
            {
              authorName: 'Maria',
              text: 'Ótimo!',
              avatarUrl: 'https://img.example.test/public/avatar.jpg',
            },
          ],
        },
      },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, makeSeo());

    expect(result.layout).toEqual(modules);
  });

  it('resolves a tmp/ (not-yet-promoted) logoUrl via tmpSignedUrls', () => {
    const tmpSignedUrls = new Map([[TMP_LOGO_PATH, SIGNED_URL]]);

    const result = resolveDraftImageUrls(
      makeBranding({ logoUrl: TMP_LOGO_PATH }),
      [],
      makeSeo(),
      tmpSignedUrls,
    );

    expect(result.branding.logoUrl).toBe(SIGNED_URL);
  });

  it('resolves a tmp/ logoUrl to an empty string when no entry exists yet in tmpSignedUrls (loading)', () => {
    const result = resolveDraftImageUrls(makeBranding({ logoUrl: TMP_LOGO_PATH }), [], makeSeo());

    expect(result.branding.logoUrl).toBe('');
  });

  it('resolves a tmp/ (not-yet-promoted) seo.ogImageUrl via tmpSignedUrls, same as branding.logoUrl', () => {
    const tmpPath = 'tmp/tenant-1/seo-og-image/u1/og-image.png';
    const tmpSignedUrls = new Map([[tmpPath, 'https://storage.example.com/signed-read?sig=og']]);

    const result = resolveDraftImageUrls(
      makeBranding(),
      [],
      makeSeo({ ogImageUrl: tmpPath }),
      tmpSignedUrls,
    );

    expect(result.seo.ogImageUrl).toBe('https://storage.example.com/signed-read?sig=og');
  });

  it('leaves a module with no image fields unchanged', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, makeSeo());

    expect(result.layout[0].data).toEqual(modules[0].data);
  });
});

describe('resolveDraftImageUrl', () => {
  const TMP_PATH = 'tmp/tenant-1/seo-og-image/u1/og-image.png';

  it.each([
    ['an empty value', '', ''],
    ['an absolute URL', 'https://cdn.example.com/a.png', 'https://cdn.example.com/a.png'],
  ])('passes %s through unchanged', (_label, value, expected) => {
    expect(resolveDraftImageUrl(value)).toBe(expected);
  });

  it('resolves a tmp/ path through the signed-URL map, and to empty while it is still loading', () => {
    const signed = new Map([[TMP_PATH, 'https://storage.example.com/signed?sig=og']]);

    expect(resolveDraftImageUrl(TMP_PATH, signed)).toBe(
      'https://storage.example.com/signed?sig=og',
    );
    expect(resolveDraftImageUrl(TMP_PATH, new Map())).toBe('');
    expect(resolveDraftImageUrl(TMP_PATH)).toBe('');
  });
});
