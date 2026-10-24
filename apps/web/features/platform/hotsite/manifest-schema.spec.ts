import { describe, expect, it } from 'vitest';
import { parseManifestJson } from './manifest-schema';

const VALID_BRANDING = {
  primaryColor: '#F5A800',
  secondaryColor: '#1A1A1A',
  backgroundColor: '#0A0A0A',
  textColor: '#FFFFFF',
  headingFontFamily: 'Montserrat',
  bodyFontFamily: 'Montserrat',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
};

const VALID_SEO = { title: null, description: null, ogImageUrl: '' };

const VALID_HERO_MODULE = {
  type: 'HERO',
  enabled: true,
  data: {
    variant: 'centered',
    title: 'Bem-vindo',
    ctaLabel: 'Ver serviços',
    ctaTarget: 'service-list',
  },
};

function manifestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    branding: VALID_BRANDING,
    layout: [VALID_HERO_MODULE],
    seo: VALID_SEO,
    ...overrides,
  });
}

describe('parseManifestJson', () => {
  it('parses a valid manifest and materializes the layout to all 12 module types', () => {
    const result = parseManifestJson(manifestJson());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.branding).toMatchObject(VALID_BRANDING);
    expect(result.value.seo).toEqual(VALID_SEO);
    expect(result.value.layout).toHaveLength(12);
    expect(result.value.layout.find((m) => m.type === 'HERO')).toMatchObject(VALID_HERO_MODULE);
    expect(result.value.layout.find((m) => m.type === 'FOOTER')?.enabled).toBe(false);
    expect(result.value.layout.find((m) => m.type === 'CHATBOT')?.enabled).toBe(false);
    expect(result.value.layout.find((m) => m.type === 'LEAD_FORM')?.enabled).toBe(false);
  });

  it('rejects invalid JSON syntax', () => {
    const result = parseManifestJson('{ branding: not valid json');

    expect(result).toEqual({
      success: false,
      error: 'invalid JSON syntax',
      reason: { code: 'invalidSyntax' },
    });
  });

  it('rejects a manifest missing a required branding field', () => {
    const brandingWithoutPrimaryColor: Record<string, unknown> = { ...VALID_BRANDING };
    delete brandingWithoutPrimaryColor.primaryColor;
    const result = parseManifestJson(manifestJson({ branding: brandingWithoutPrimaryColor }));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toEqual({ code: 'invalidStructure' });
  });

  it('rejects a branding field with the wrong primitive type', () => {
    const result = parseManifestJson(
      manifestJson({ branding: { ...VALID_BRANDING, primaryColor: 5 } }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects seo.title with the wrong primitive type', () => {
    const result = parseManifestJson(
      manifestJson({ seo: { title: 42, description: null, ogImageUrl: '' } }),
    );

    expect(result.success).toBe(false);
  });

  it('accepts seo with null title and description', () => {
    const result = parseManifestJson(
      manifestJson({ seo: { title: null, description: null, ogImageUrl: '' } }),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a manifest missing seo.ogImageUrl', () => {
    const seoWithoutOgImageUrl = { title: null, description: null };
    const result = parseManifestJson(manifestJson({ seo: seoWithoutOgImageUrl }));

    expect(result.success).toBe(false);
  });

  it('rejects a layout module with an unknown type', () => {
    const result = parseManifestJson(
      manifestJson({ layout: [{ type: 'UNKNOWN', enabled: true, data: {} }] }),
    );

    expect(result).toEqual({
      success: false,
      error: 'unknown module type "UNKNOWN"',
      reason: { code: 'unknownModuleType', moduleType: 'UNKNOWN' },
    });
  });

  it('rejects a layout with a duplicate module type', () => {
    const result = parseManifestJson(
      manifestJson({ layout: [VALID_HERO_MODULE, VALID_HERO_MODULE] }),
    );

    expect(result).toEqual({
      success: false,
      error: 'duplicate module type "HERO"',
      reason: { code: 'duplicateModuleType', moduleType: 'HERO' },
    });
  });

  it('rejects a layout with more than 12 modules', () => {
    const thirteenModules = Array.from({ length: 13 }, (_, i) => ({
      type: 'HERO',
      enabled: true,
      data: {},
      _dedupe: i,
    }));
    const result = parseManifestJson(
      JSON.stringify({ branding: VALID_BRANDING, layout: thirteenModules, seo: VALID_SEO }),
    );

    expect(result).toEqual({
      success: false,
      error: 'layout must have at most 12 modules',
      reason: { code: 'tooManyModules', max: 12 },
    });
  });

  it("rejects a module whose data fails that module type's own schema", () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [{ type: 'HERO', enabled: true, data: { variant: 'not-a-real-variant' } }],
      }),
    );

    expect(result).toEqual({
      success: false,
      error: 'invalid data for module "HERO"',
      reason: { code: 'invalidModuleData', moduleType: 'HERO' },
    });
  });

  it('ignores extra top-level keys instead of rejecting them', () => {
    const result = parseManifestJson(
      manifestJson({
        tenant: { id: 't1' },
        isPublished: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).not.toHaveProperty('tenant');
    expect(result.value).not.toHaveProperty('isPublished');
    expect(result.value).not.toHaveProperty('updatedAt');
  });

  it('strips extra keys nested inside branding too', () => {
    const result = parseManifestJson(
      manifestJson({ branding: { ...VALID_BRANDING, notARealField: 'x' } }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.branding).not.toHaveProperty('notARealField');
  });

  // Regression: HotsiteImageUrlResolver (backend) and mapHotsiteImageFields (web) both pass an
  // explicit `null` through unchanged for these 3 fields rather than normalizing it — a module
  // configured via a direct API write (not the config panel, which only ever writes '' or a real
  // path) can have this as literal `null` on read. A real tenant's manifest with an ABOUT
  // module's imageUrl: null failed Aplicar on the very first, unedited click before this fix.
  it('accepts an explicit null for backgroundImageUrl/imageUrl/avatarUrl, not just a missing key', () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [
          {
            type: 'HERO',
            enabled: true,
            data: {
              variant: 'centered',
              title: 'x',
              ctaLabel: 'y',
              ctaTarget: 'booking-form',
              backgroundImageUrl: null,
            },
          },
          {
            type: 'ABOUT',
            enabled: true,
            data: { title: 'Sobre', body: 'Texto', imagePosition: 'right', imageUrl: null },
          },
          {
            type: 'TESTIMONIALS',
            enabled: true,
            data: {
              layout: 'grid',
              items: [{ authorName: 'Maria', text: 'Ótimo', avatarUrl: null }],
            },
          },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe('parseManifestJson — NAVIGATION, CONTENT_BLOCK and presentation', () => {
  const NAVIGATION = {
    type: 'NAVIGATION',
    enabled: true,
    data: { items: [{ label: 'Serviços', target: 'service-list' }] },
  };
  const CONTENT_BLOCK = {
    type: 'CONTENT_BLOCK',
    enabled: true,
    data: { variant: 'image-statement', title: 'Nossa história' },
  };

  it('accepts NAVIGATION first and CONTENT_BLOCK, keeping presentation on the module', () => {
    const presentation = { surface: 'custom', customColor: '#0B0908', minHeight: 'lg' };
    const result = parseManifestJson(
      manifestJson({
        layout: [NAVIGATION, VALID_HERO_MODULE, { ...CONTENT_BLOCK, presentation }],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.layout.map((m) => m.type).slice(0, 3)).toEqual([
      'NAVIGATION',
      'HERO',
      'CONTENT_BLOCK',
    ]);
    expect(result.value.layout.find((m) => m.type === 'CONTENT_BLOCK')?.presentation).toEqual(
      presentation,
    );
  });

  // Both are materialized as disabled rows now that the editor has a panel for each; NAVIGATION is
  // put first, where the backend requires it.
  it('adds NAVIGATION (first) and CONTENT_BLOCK, both disabled, to a manifest that lacks them', () => {
    const result = parseManifestJson(manifestJson());

    expect(result.success && result.value.layout).toHaveLength(12);
    if (!result.success) return;
    expect(result.value.layout[0]).toMatchObject({ type: 'NAVIGATION', enabled: false });
    expect(result.value.layout.find((m) => m.type === 'CONTENT_BLOCK')?.enabled).toBe(false);
  });

  it('rejects a NAVIGATION that is not the first module with navigationNotFirst', () => {
    const result = parseManifestJson(manifestJson({ layout: [VALID_HERO_MODULE, NAVIGATION] }));

    expect(result).toEqual({
      success: false,
      error: 'the NAVIGATION module must be the first module',
      reason: { code: 'navigationNotFirst' },
    });
  });

  it('rejects an invalid presentation with invalidPresentation naming the module', () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [{ ...VALID_HERO_MODULE, presentation: { surface: 'custom' } }],
      }),
    );

    expect(result).toEqual({
      success: false,
      error: 'invalid presentation for module "HERO"',
      reason: { code: 'invalidPresentation', moduleType: 'HERO' },
    });
  });

  it('rejects CONTENT_BLOCK data outside its closed variant union', () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [{ ...CONTENT_BLOCK, data: { variant: 'banner', title: 'T' } }],
      }),
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.reason).toEqual({
      code: 'invalidModuleData',
      moduleType: 'CONTENT_BLOCK',
    });
  });

  // The backend owns this rule (it needs the whole layout); the Manifesto tab only rejects what
  // would break the client at once, and the violation shows on Publish.
  it('accepts a navigation target that is not an enabled module (the backend owns that rule)', () => {
    const result = parseManifestJson(manifestJson({ layout: [NAVIGATION, VALID_HERO_MODULE] }));

    expect(result.success).toBe(true);
  });

  it('accepts a module with a presentation that only the backend can judge (FOOTER)', () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [
          VALID_HERO_MODULE,
          { type: 'FOOTER', enabled: true, data: {}, presentation: { surface: 'primary' } },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it('keeps the new optional branding tokens instead of stripping them', () => {
    const result = parseManifestJson(
      manifestJson({
        branding: {
          ...VALID_BRANDING,
          buttonRadius: 'pill',
          headingWeight: 900,
          headingTransform: 'uppercase',
        },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.branding).toMatchObject({
      buttonRadius: 'pill',
      headingWeight: 900,
      headingTransform: 'uppercase',
    });
  });
});
