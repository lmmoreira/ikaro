import { describe, expect, it } from 'vitest';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';
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

function makeSeo(overrides: Partial<HotsiteSeoResponse> = {}): HotsiteSeoResponse {
  return { title: null, description: null, ogImageUrl: '', ...overrides };
}

describe('stripResolvedImageUrls', () => {
  it('strips a resolved logoUrl back to its raw storage path', () => {
    const result = stripResolvedImageUrls(
      makeBranding({ logoUrl: RESOLVED_LOGO_URL }),
      [],
      makeSeo(),
      TENANT_ID,
    );

    expect(result.branding.logoUrl).toBe(RAW_LOGO_PATH);
  });

  it('leaves an empty logoUrl unchanged', () => {
    const result = stripResolvedImageUrls(makeBranding({ logoUrl: '' }), [], makeSeo(), TENANT_ID);

    expect(result.branding.logoUrl).toBe('');
  });

  it('leaves an already-raw logoUrl unchanged (idempotent)', () => {
    const result = stripResolvedImageUrls(
      makeBranding({ logoUrl: RAW_LOGO_PATH }),
      [],
      makeSeo(),
      TENANT_ID,
    );

    expect(result.branding.logoUrl).toBe(RAW_LOGO_PATH);
  });

  it('leaves a tmp/ staging path unchanged (no tenant marker to strip, forward-compatible with TD22)', () => {
    const tmpPath = `tmp/${TENANT_ID}/branding/xyz/logo.png`;
    const result = stripResolvedImageUrls(
      makeBranding({ logoUrl: tmpPath }),
      [],
      makeSeo(),
      TENANT_ID,
    );

    expect(result.branding.logoUrl).toBe(tmpPath);
  });

  it('strips a resolved seo.ogImageUrl back to its raw storage path, same as branding.logoUrl', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/seo-og-image/abc/og-image.png`;
    const resolvedUrl = `https://storage.googleapis.com/ikaro-public/${rawPath}`;

    const result = stripResolvedImageUrls(
      makeBranding(),
      [],
      makeSeo({ ogImageUrl: resolvedUrl }),
      TENANT_ID,
    );

    expect(result.seo.ogImageUrl).toBe(rawPath);
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

    const result = stripResolvedImageUrls(makeBranding(), modules, makeSeo(), TENANT_ID);

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

    const result = stripResolvedImageUrls(makeBranding(), modules, makeSeo(), TENANT_ID);

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

    const result = stripResolvedImageUrls(makeBranding(), modules, makeSeo(), TENANT_ID);

    expect((result.layout[0].data.items as Array<{ avatarUrl: string }>)[0].avatarUrl).toBe(
      rawPath,
    );
  });

  describe('catalogue (template) images', () => {
    const CATALOGUE_PATH = 'shared/hotsite-templates/casa47/v1/hero.webp';
    const RESOLVED_CATALOGUE_URL = `https://storage.googleapis.com/ikaro-public-staging/${CATALOGUE_PATH}`;
    const heroWith = (backgroundImageUrl: string): HotsiteModuleResponse[] => [
      { type: 'HERO', enabled: true, data: { backgroundImageUrl } },
    ];

    it('recovers a catalogue path from its resolved public URL, so an applied template can be saved', () => {
      const result = stripResolvedImageUrls(
        makeBranding(),
        heroWith(RESOLVED_CATALOGUE_URL),
        makeSeo(),
        TENANT_ID,
      );

      expect(result.layout[0].data.backgroundImageUrl).toBe(CATALOGUE_PATH);
    });

    it('recovers catalogue paths nested in a section background, a collage and a gallery', () => {
      const nested: HotsiteModuleResponse[] = [
        {
          type: 'ABOUT',
          enabled: true,
          data: {},
          presentation: { background: { imageUrl: RESOLVED_CATALOGUE_URL } },
        },
        {
          type: 'CONTENT_BLOCK',
          enabled: true,
          data: { variant: 'collage-callout', images: [{ url: RESOLVED_CATALOGUE_URL }] },
        },
        {
          type: 'GALLERY',
          enabled: true,
          data: { images: [{ url: RESOLVED_CATALOGUE_URL, source: 'upload' }] },
        },
      ];

      const [about, block, gallery] = stripResolvedImageUrls(
        makeBranding(),
        nested,
        makeSeo(),
        TENANT_ID,
      ).layout;

      expect(about.presentation?.background?.imageUrl).toBe(CATALOGUE_PATH);
      expect((block.data.images as Array<{ url: string }>)[0].url).toBe(CATALOGUE_PATH);
      expect((gallery.data.images as Array<{ url: string }>)[0].url).toBe(CATALOGUE_PATH);
    });

    it('is idempotent on an already-raw catalogue path', () => {
      const result = stripResolvedImageUrls(
        makeBranding(),
        heroWith(CATALOGUE_PATH),
        makeSeo(),
        TENANT_ID,
      );

      expect(result.layout[0].data.backgroundImageUrl).toBe(CATALOGUE_PATH);
    });

    it('still recovers this tenant’s own paths next to a catalogue path', () => {
      const result = stripResolvedImageUrls(
        makeBranding({ logoUrl: RESOLVED_LOGO_URL }),
        heroWith(RESOLVED_CATALOGUE_URL),
        makeSeo(),
        TENANT_ID,
      );

      expect(result.branding.logoUrl).toBe(RAW_LOGO_PATH);
      expect(result.layout[0].data.backgroundImageUrl).toBe(CATALOGUE_PATH);
    });

    it('does not rewrite another tenant’s URL into this tenant’s prefix (negative guarantee)', () => {
      const otherTenantUrl =
        'https://storage.googleapis.com/ikaro-public/tenants/99999999-0000-7000-8000-000000000009/hotsite/hero/abc/bg.jpg';

      const result = stripResolvedImageUrls(
        makeBranding(),
        heroWith(otherTenantUrl),
        makeSeo(),
        TENANT_ID,
      );

      expect(result.layout[0].data.backgroundImageUrl).toBe(otherTenantUrl);
    });

    it('passes any other absolute URL through unchanged', () => {
      const result = stripResolvedImageUrls(
        makeBranding(),
        heroWith('https://example.com/hero.jpg'),
        makeSeo(),
        TENANT_ID,
      );

      expect(result.layout[0].data.backgroundImageUrl).toBe('https://example.com/hero.jpg');
    });
  });

  it('leaves a module with no image fields unchanged', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = stripResolvedImageUrls(makeBranding(), modules, makeSeo(), TENANT_ID);

    expect(result.layout[0].data).toEqual(modules[0].data);
  });
});
