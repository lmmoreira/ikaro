import {
  GenericErrorCode,
  HOTSITE_FONT_FAMILIES,
  HOTSITE_LEGACY_DEFAULT_FONT_FAMILY,
  HexColorErrorCode,
  SeoErrorCode,
} from '@ikaro/types';
import {
  HotsiteBrandingSchema,
  HOTSITE_MODULE_TYPES,
  HotsiteSeoSchema,
  isValidHexColor,
  isValidSeoDescription,
  isValidSeoTitle,
} from './hotsite';

describe('isValidHexColor', () => {
  it('accepts a well-formed 6-digit hex color', () => {
    expect(isValidHexColor('#FF5733')).toBe(true);
  });

  it('rejects a 3-digit shorthand', () => {
    expect(isValidHexColor('#FFF')).toBe(false);
  });

  it('rejects a value missing the leading #', () => {
    expect(isValidHexColor('FF5733')).toBe(false);
  });
});

describe('isValidSeoTitle / isValidSeoDescription', () => {
  it('accepts a title at exactly the max length', () => {
    expect(isValidSeoTitle('a'.repeat(60))).toBe(true);
  });

  it('rejects a title over the max length', () => {
    expect(isValidSeoTitle('a'.repeat(61))).toBe(false);
  });

  it('accepts a description at exactly the max length', () => {
    expect(isValidSeoDescription('a'.repeat(158))).toBe(true);
  });

  it('rejects a description over the max length', () => {
    expect(isValidSeoDescription('a'.repeat(159))).toBe(false);
  });
});

describe('HotsiteBrandingSchema', () => {
  it('accepts a partial branding update', () => {
    expect(HotsiteBrandingSchema.safeParse({ primaryColor: '#111111' }).success).toBe(true);
  });

  it('rejects an invalid hex color with HexColorErrorCode.FORMAT_INVALID', () => {
    const result = HotsiteBrandingSchema.safeParse({ primaryColor: 'not-a-color' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
      expect(issue.params?.code).toBe(HexColorErrorCode.FORMAT_INVALID);
    }
  });

  describe('font registry', () => {
    it.each(HOTSITE_FONT_FAMILIES)('accepts the registry font %s for both families', (font) => {
      expect(
        HotsiteBrandingSchema.safeParse({ headingFontFamily: font, bodyFontFamily: font }).success,
      ).toBe(true);
    });

    it('still accepts the default every new tenant is created with', () => {
      expect(
        HotsiteBrandingSchema.safeParse({
          headingFontFamily: HOTSITE_LEGACY_DEFAULT_FONT_FAMILY,
          bodyFontFamily: HOTSITE_LEGACY_DEFAULT_FONT_FAMILY,
        }).success,
      ).toBe(true);
    });

    it.each(['headingFontFamily', 'bodyFontFamily'])(
      'rejects an arbitrary %s with GENERIC_VALUE_INVALID',
      (field) => {
        const result = HotsiteBrandingSchema.safeParse({ [field]: 'Comic Sans; color: red' });
        expect(result.success).toBe(false);
        if (!result.success) {
          const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
          expect(issue.params?.code).toBe(GenericErrorCode.VALUE_INVALID);
        }
      },
    );

    it('rejects an empty font family', () => {
      expect(HotsiteBrandingSchema.safeParse({ bodyFontFamily: '' }).success).toBe(false);
    });
  });

  it('accepts an empty logoUrl (clears the logo)', () => {
    expect(HotsiteBrandingSchema.safeParse({ logoUrl: '' }).success).toBe(true);
  });

  it('accepts a permanent hotsite storage path for logoUrl', () => {
    expect(
      HotsiteBrandingSchema.safeParse({ logoUrl: 'tenants/t1/hotsite/logo.png' }).success,
    ).toBe(true);
  });

  it('accepts a tmp/ staging path with the hotsite 5-segment shape for logoUrl', () => {
    expect(HotsiteBrandingSchema.safeParse({ logoUrl: 'tmp/t1/logo/uuid/file.png' }).success).toBe(
      true,
    );
  });

  it("rejects a booking-shaped tmp/ path (missing the hotsite 'purpose' segment)", () => {
    const result = HotsiteBrandingSchema.safeParse({ logoUrl: 'tmp/t1/uuid/file.png' });
    expect(result.success).toBe(false);
  });
});

describe('HotsiteSeoSchema', () => {
  it('accepts a title within the max length', () => {
    expect(HotsiteSeoSchema.safeParse({ title: 'A great title' }).success).toBe(true);
  });

  it('rejects a title over 60 chars with SeoErrorCode.TITLE_TOO_LONG', () => {
    const result = HotsiteSeoSchema.safeParse({ title: 'a'.repeat(61) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
      expect(issue.params?.code).toBe(SeoErrorCode.TITLE_TOO_LONG);
    }
  });

  it('accepts a null title (clears it)', () => {
    expect(HotsiteSeoSchema.safeParse({ title: null }).success).toBe(true);
  });

  it('rejects a description over 158 chars with SeoErrorCode.DESCRIPTION_TOO_LONG', () => {
    const result = HotsiteSeoSchema.safeParse({ description: 'a'.repeat(159) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
      expect(issue.params?.code).toBe(SeoErrorCode.DESCRIPTION_TOO_LONG);
    }
  });

  // M18-S03 — ogImageUrl reuses the same path-shape regex as HotsiteBrandingSchema.logoUrl.
  it('accepts an empty ogImageUrl (clears the share image)', () => {
    expect(HotsiteSeoSchema.safeParse({ ogImageUrl: '' }).success).toBe(true);
  });

  it('accepts a permanent hotsite storage path for ogImageUrl', () => {
    expect(
      HotsiteSeoSchema.safeParse({ ogImageUrl: 'tenants/t1/hotsite/og-image.png' }).success,
    ).toBe(true);
  });

  it('accepts a tmp/ staging path with the hotsite 5-segment shape for ogImageUrl', () => {
    expect(
      HotsiteSeoSchema.safeParse({ ogImageUrl: 'tmp/t1/seo-og-image/uuid/file.png' }).success,
    ).toBe(true);
  });

  it("rejects a booking-shaped tmp/ path (missing the hotsite 'purpose' segment) for ogImageUrl", () => {
    const result = HotsiteSeoSchema.safeParse({ ogImageUrl: 'tmp/t1/uuid/file.png' });
    expect(result.success).toBe(false);
  });
});

describe('HOTSITE_MODULE_TYPES', () => {
  it('lists NAVIGATION first, as the layout editor and the aggregate both pin it', () => {
    expect(HOTSITE_MODULE_TYPES[0]).toBe('NAVIGATION');
  });

  it('has no duplicates', () => {
    expect(new Set(HOTSITE_MODULE_TYPES).size).toBe(HOTSITE_MODULE_TYPES.length);
  });
});
