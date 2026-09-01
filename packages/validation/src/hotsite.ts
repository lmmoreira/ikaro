import { z } from 'zod';
import { GenericErrorCode, HexColorErrorCode, SeoErrorCode } from '@ikaro/types';

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

// Same path shape as logoUrl (HOTSITE_LOGO_URL_REGEX) — only the message differs per field.
export const HOTSITE_OG_IMAGE_URL_MESSAGE = {
  message:
    'ogImageUrl must be empty (to clear), a tenants/<id>/hotsite/... storage path, or a tmp/<id>/... staging path',
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

// Single canonical source for the HotsiteModuleType concept (TD37-S21) — the backend domain type
// (apps/backend/.../hotsite-config.types.ts) and its aggregate's runtime MODULE_TYPES Set both
// derive from this tuple instead of hand-duplicating it. packages/types/src/enums.ts's own
// HotsiteModuleType stays a deliberately separate, web-facing copy (apps/web must never depend on
// @ikaro/validation) — guarded by packages/architecture-check's closedEnumRegistry detector, which
// allows that copy to lag behind this one (e.g. during a staged rollout like LEAD_FORM's, M20-S01
// → M20-S07) but never lead ahead of it.
export const HOTSITE_MODULE_TYPES = [
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTACT',
  'FOOTER',
  'CHATBOT',
  'LEAD_FORM',
] as const;

export type HotsiteModuleType = (typeof HOTSITE_MODULE_TYPES)[number];

export const HotsiteModuleSchema = z
  .object({
    type: z.enum(HOTSITE_MODULE_TYPES),
    enabled: z.boolean(),
    data: z.record(z.string(), z.unknown()),
  })
  .refine(
    (module) =>
      module.type !== 'LEAD_FORM' ||
      (!('audienceMode' in module.data) && !('questions' in module.data)),
    {
      // audienceMode/questions live in LeadFormConfig, never in HotsiteConfig.layout[] — that blob
      // feeds the public-cached manifest (docs/02-DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate
      // save"). Without this check, `data`'s otherwise-unconstrained z.record() would let a caller
      // smuggle both fields into the cached layout entry directly, bypassing LeadFormConfig's own
      // validation (the 20-question cap included) entirely (M20-S08 PR #429 Codex review finding,
      // 2026-08-26 — the frontend's stripLeadFormConfig() is a UI courtesy, not an API boundary).
      error:
        "a LEAD_FORM module's own data must not include audienceMode or questions — send them as top-level fields on PATCH /v1/tenants/hotsite instead",
      params: { code: GenericErrorCode.VALUE_INVALID },
      path: ['data'],
    },
  );

// M20-S01 — shared by the backend (update-hotsite-content.dto.ts) and BFF
// (hotsite-admin.schemas.ts) as part of the consolidated hotsite-content update schema; both need
// the identical shape with no per-app deviation, so this lives here directly rather than
// duplicated (mirrors HotsiteModuleSchema's own direct-reuse pattern above, not
// buildUpdateTenantSettingsSchema's per-app-customization pattern in tenant-settings.ts — there's
// no field here that differs between backend and BFF).
//
// Question-level bounds (≤20 entries, 2-10 options for choice types, non-empty label, unique id)
// are deliberately NOT re-validated here — LeadFormConfig.updateQuestions() is this rule's sole
// owner (docs/ENGINEERING_RULES.md § Single source of truth for a validation rule's code). A
// second Zod-side check here risks emitting a different code for the identical violation
// depending on which layer catches it first.
export const LeadFormQuestionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  type: z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE']),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  order: z.number().int(),
});

export const LeadFormAudienceModeSchema = z.enum(['GUEST_AND_CUSTOMER', 'CUSTOMER_ONLY']);

// Teaser fields mirror BookingCtaModuleData's own shape family (docs/15-HOTSITE_DYNAMIC_
// ARCHITECTURE.md § LEAD_FORM) — standard hotsite-layout enum validation for variant/bgStyle/
// backgroundImagePosition, same as every other module's teaser data.
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
    ogImageUrl: z.string().regex(HOTSITE_LOGO_URL_REGEX, HOTSITE_OG_IMAGE_URL_MESSAGE),
  })
  .partial();
