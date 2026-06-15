import { z } from 'zod';
import { HexColor } from '../../../../shared/value-objects/hex-color.vo';

const HEX_COLOR_MESSAGE = { message: 'must be a valid hex color (e.g. #FF5733)' };
const LOGO_URL_REGEX = /^$|^tenants\/[^/]+\/hotsite\/.+$/;
const LOGO_URL_MESSAGE = {
  message: 'logoUrl must be empty (to clear) or a tenants/<id>/hotsite/... storage path',
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
  ]),
  enabled: z.boolean(),
  data: z.record(z.string(), z.unknown()),
});

const HotsiteSeoSchema = z
  .object({
    title: z.string().max(70).nullable(),
    description: z.string().max(160).nullable(),
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
    { message: 'at least one of branding, layout, or seo must be provided' },
  );

export type UpdateHotsiteContentDto = z.infer<typeof UpdateHotsiteContentSchema>;
