import { z } from 'zod';
import { HexColorErrorCode, PlatformErrorCode, SeoErrorCode } from '@ikaro/types';
import { HexColor } from '../../../../shared/value-objects/hex-color.vo';
import { SeoTitle } from '../../../../shared/value-objects/seo-title.vo';
import { SeoDescription } from '../../../../shared/value-objects/seo-description.vo';
import { HOTSITE_TMP_PATH_FRAGMENT } from '../../../../shared/utils/tmp-path-regex';

const HEX_COLOR_MESSAGE = {
  error: 'must be a valid hex color (e.g. #FF5733)',
  params: { code: HexColorErrorCode.FORMAT_INVALID },
};
const SEO_TITLE_MESSAGE = {
  error: `must be at most ${SeoTitle.MAX_LENGTH} characters`,
  params: { code: SeoErrorCode.TITLE_TOO_LONG },
};
const SEO_DESCRIPTION_MESSAGE = {
  error: `must be at most ${SeoDescription.MAX_LENGTH} characters`,
  params: { code: SeoErrorCode.DESCRIPTION_TOO_LONG },
};
// Accepts empty (to clear), an already-permanent hotsite image, or a not-yet-promoted tmp/
// staging upload — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
const LOGO_URL_REGEX = new RegExp(`^$|^tenants/[^/]+/hotsite/.+$|^${HOTSITE_TMP_PATH_FRAGMENT}$`);
const LOGO_URL_MESSAGE = {
  message:
    'logoUrl must be empty (to clear), a tenants/<id>/hotsite/... storage path, or a tmp/<id>/... staging path',
};

const HotsiteBrandingSchema = z
  .object({
    primaryColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    secondaryColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    backgroundColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    textColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    headingFontFamily: z.string().min(1),
    bodyFontFamily: z.string().min(1),
    logoUrl: z.string().regex(LOGO_URL_REGEX, LOGO_URL_MESSAGE),
    borderRadius: z.enum(['sharp', 'rounded', 'pill']),
    buttonStyle: z.enum(['filled', 'outline', 'ghost']),
    spacing: z.enum(['compact', 'comfortable', 'spacious']),
    shadowStyle: z.enum(['none', 'subtle', 'strong']),
    buttonBackgroundColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    buttonTextColor: z.string().refine(HexColor.isValid, HEX_COLOR_MESSAGE),
    heroBgStyle: z.enum(['primary', 'background']),
    alternateSectionBg: z.boolean(),
    dividerStyle: z.enum(['none', 'gradient', 'solid']),
    brandName: z.string().max(100),
    brandTagline: z.string().max(200),
  })
  .partial();

const HotsiteModuleSchema = z.object({
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

const HotsiteSeoSchema = z
  .object({
    title: z.string().refine(SeoTitle.isValid, SEO_TITLE_MESSAGE).nullable(),
    description: z.string().refine(SeoDescription.isValid, SEO_DESCRIPTION_MESSAGE).nullable(),
  })
  .partial();

export const UpdateHotsiteContentSchema = z
  .object({
    branding: HotsiteBrandingSchema.optional(),
    layout: z.array(HotsiteModuleSchema).optional(),
    seo: HotsiteSeoSchema.optional(),
  })
  .refine(
    (data) => data.branding !== undefined || data.layout !== undefined || data.seo !== undefined,
    {
      error: 'at least one of branding, layout, or seo must be provided',
      params: { code: PlatformErrorCode.HOTSITE_UPDATE_EMPTY },
    },
  );

export type UpdateHotsiteContentDto = z.infer<typeof UpdateHotsiteContentSchema>;
