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

const VALID_SEO = { title: null, description: null };

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
  it('parses a valid manifest and materializes the layout to all 8 module types', () => {
    const result = parseManifestJson(manifestJson());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.branding).toMatchObject(VALID_BRANDING);
    expect(result.value.seo).toEqual(VALID_SEO);
    expect(result.value.layout).toHaveLength(8);
    expect(result.value.layout.find((m) => m.type === 'HERO')).toMatchObject(VALID_HERO_MODULE);
    expect(result.value.layout.find((m) => m.type === 'FOOTER')?.enabled).toBe(false);
  });

  it('rejects invalid JSON syntax', () => {
    const result = parseManifestJson('{ branding: not valid json');

    expect(result).toEqual({ success: false, error: 'invalid JSON syntax' });
  });

  it('rejects a manifest missing a required branding field', () => {
    const brandingWithoutPrimaryColor: Record<string, unknown> = { ...VALID_BRANDING };
    delete brandingWithoutPrimaryColor.primaryColor;
    const result = parseManifestJson(manifestJson({ branding: brandingWithoutPrimaryColor }));

    expect(result.success).toBe(false);
  });

  it('rejects a branding field with the wrong primitive type', () => {
    const result = parseManifestJson(
      manifestJson({ branding: { ...VALID_BRANDING, primaryColor: 5 } }),
    );

    expect(result.success).toBe(false);
  });

  it('rejects seo.title with the wrong primitive type', () => {
    const result = parseManifestJson(manifestJson({ seo: { title: 42, description: null } }));

    expect(result.success).toBe(false);
  });

  it('accepts seo with null title and description', () => {
    const result = parseManifestJson(manifestJson({ seo: { title: null, description: null } }));

    expect(result.success).toBe(true);
  });

  it('rejects a layout module with an unknown type', () => {
    const result = parseManifestJson(
      manifestJson({ layout: [{ type: 'UNKNOWN', enabled: true, data: {} }] }),
    );

    expect(result).toEqual({ success: false, error: 'unknown module type "UNKNOWN"' });
  });

  it('rejects a layout with a duplicate module type', () => {
    const result = parseManifestJson(
      manifestJson({ layout: [VALID_HERO_MODULE, VALID_HERO_MODULE] }),
    );

    expect(result).toEqual({ success: false, error: 'duplicate module type "HERO"' });
  });

  it('rejects a layout with more than 8 modules', () => {
    const nineModules = Array.from({ length: 9 }, (_, i) => ({
      type: 'HERO',
      enabled: true,
      data: {},
      _dedupe: i,
    }));
    const result = parseManifestJson(
      JSON.stringify({ branding: VALID_BRANDING, layout: nineModules, seo: VALID_SEO }),
    );

    expect(result).toEqual({ success: false, error: 'layout must have at most 8 modules' });
  });

  it("rejects a module whose data fails that module type's own schema", () => {
    const result = parseManifestJson(
      manifestJson({
        layout: [{ type: 'HERO', enabled: true, data: { variant: 'not-a-real-variant' } }],
      }),
    );

    expect(result).toEqual({ success: false, error: 'invalid data for module "HERO"' });
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
