import { z } from 'zod';
import { HexColorErrorCode, SeoErrorCode } from '@ikaro/types';

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_PATTERN.test(color);
}

export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 158;

export function isValidSeoTitle(title: string): boolean {
  return title.length <= SEO_TITLE_MAX_LENGTH;
}

export function isValidSeoDescription(description: string): boolean {
  return description.length <= SEO_DESCRIPTION_MAX_LENGTH;
}

// Single source of truth for the tmp/ staging path shapes (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
// Booking uploads use tmp/<tenantId>/<uuid>/<fileName> (no purpose segment); hotsite uploads use
// tmp/<tenantId>/<purpose>/<uuid>/<fileName> — one segment longer. The two shapes must stay
// distinguishable: HOTSITE_TMP_PATH_FRAGMENT requires exactly the hotsite segment count so a
// hotsite endpoint can never accept a booking tmp/ upload's path (or vice versa) just because
// both live under the same tmp/<tenantId>/ prefix.
export const HOTSITE_TMP_PATH_FRAGMENT = 'tmp/[^/]+/[^/]+/[^/]+/[^/]+';

// Accepts empty (to clear), an already-permanent hotsite image, or a not-yet-promoted tmp/
// staging upload — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
export const HOTSITE_LOGO_URL_REGEX = new RegExp(
  `^$|^tenants/[^/]+/hotsite/.+$|^${HOTSITE_TMP_PATH_FRAGMENT}$`,
);
export const HOTSITE_LOGO_URL_MESSAGE = {
  message:
    'logoUrl must be empty (to clear), a tenants/<id>/hotsite/... storage path, or a tmp/<id>/... staging path',
};

const hexColorField = (): z.ZodString =>
  z.string().refine((v) => isValidHexColor(v), {
    error: 'must be a valid hex color (e.g. #FF5733)',
    params: { code: HexColorErrorCode.FORMAT_INVALID },
  });

export const HotsiteBrandingSchema = z
  .object({
    primaryColor: hexColorField(),
    secondaryColor: hexColorField(),
    backgroundColor: hexColorField(),
    textColor: hexColorField(),
    headingFontFamily: z.string().min(1),
    bodyFontFamily: z.string().min(1),
    logoUrl: z.string().regex(HOTSITE_LOGO_URL_REGEX, HOTSITE_LOGO_URL_MESSAGE),
    borderRadius: z.enum(['sharp', 'rounded', 'pill']),
    buttonStyle: z.enum(['filled', 'outline', 'ghost']),
    spacing: z.enum(['compact', 'comfortable', 'spacious']),
    shadowStyle: z.enum(['none', 'subtle', 'strong']),
    buttonBackgroundColor: hexColorField(),
    buttonTextColor: hexColorField(),
    heroBgStyle: z.enum(['primary', 'background']),
    alternateSectionBg: z.boolean(),
    dividerStyle: z.enum(['none', 'gradient', 'solid']),
    brandName: z.string().max(100),
    brandTagline: z.string().max(200),
  })
  .partial();

export const HotsiteModuleSchema = z.object({
  type: z.enum([
    'HERO',
    'SERVICE_LIST',
    'GALLERY',
    'TESTIMONIALS',
    'BOOKING_CTA',
    'ABOUT',
    'CONTACT',
    'FOOTER',
  ]),
  enabled: z.boolean(),
  data: z.record(z.string(), z.unknown()),
});

export const HotsiteSeoSchema = z
  .object({
    title: z
      .string()
      .refine((v) => isValidSeoTitle(v), {
        error: `must be at most ${SEO_TITLE_MAX_LENGTH} characters`,
        params: { code: SeoErrorCode.TITLE_TOO_LONG },
      })
      .nullable(),
    description: z
      .string()
      .refine((v) => isValidSeoDescription(v), {
        error: `must be at most ${SEO_DESCRIPTION_MAX_LENGTH} characters`,
        params: { code: SeoErrorCode.DESCRIPTION_TOO_LONG },
      })
      .nullable(),
  })
  .partial();
