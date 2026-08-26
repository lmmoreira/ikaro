import { z } from 'zod';
import {
  HOTSITE_TMP_PATH_FRAGMENT,
  HotsiteBrandingSchema,
  HotsiteModuleSchema,
  HotsiteSeoSchema,
  LeadFormAudienceModeSchema,
  LeadFormQuestionSchema,
} from '@ikaro/validation';
import { ALLOWED_IMAGE_CONTENT_TYPES, GenericErrorCode, PlatformErrorCode } from '@ikaro/types';

// Request Zod schemas and their inferred body types — split out of
// hotsite-admin.controller.ts so request-side shapes never live inline in the controller
// (mirrors booking/bookings.schemas.ts's existing split).
//
// audienceMode/questions (M20-S01, folded into this consolidated endpoint at M20-S08) write
// LeadFormConfig, a separate aggregate from HotsiteConfig — see
// UpdateHotsiteContentUseCase's own header comment on the backend.
export const UpdateHotsiteContentBodySchema = z
  .object({
    branding: HotsiteBrandingSchema.optional(),
    layout: z.array(HotsiteModuleSchema).optional(),
    seo: HotsiteSeoSchema.optional(),
    audienceMode: LeadFormAudienceModeSchema.optional(),
    questions: z.array(LeadFormQuestionSchema).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: 'at least one of branding, layout, seo, audienceMode, or questions must be provided',
    params: { code: PlatformErrorCode.HOTSITE_UPDATE_EMPTY },
  })
  .default({});

export type UpdateHotsiteContentBody = z.infer<typeof UpdateHotsiteContentBodySchema>;

export const GenerateHotsiteImageSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  purpose: z.enum([
    'branding',
    'hero',
    'gallery',
    'about',
    'booking-cta',
    'testimonials',
    'seo-og-image',
  ]),
});

export type GenerateHotsiteImageSignedUrlBody = z.infer<
  typeof GenerateHotsiteImageSignedUrlBodySchema
>;

// Only for not-yet-promoted tmp/ staging uploads — an already-permanent tenants/.../hotsite/...
// image resolves via the pure getPublicUrl() string template instead (see
// td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
export const GenerateHotsiteImageReadSignedUrlBodySchema = z.object({
  filePath: z.string().regex(new RegExp(`^${HOTSITE_TMP_PATH_FRAGMENT}$`)),
});

export type GenerateHotsiteImageReadSignedUrlBody = z.infer<
  typeof GenerateHotsiteImageReadSignedUrlBodySchema
>;

export const FeatureBookingPhotoBodySchema = z
  .object({
    bookingId: z.uuid(),
    filePath: z.string().regex(/^tenants\/[^/]+\/bookings\/[^/]+\/.+$/),
    photoType: z.enum(['before', 'after']),
  })
  .refine((data) => data.filePath.includes(`/bookings/${data.bookingId}/`), {
    error: 'filePath must belong to the provided bookingId',
    params: { code: PlatformErrorCode.FEATURED_PHOTO_PATH_MISMATCH },
  });

export type FeatureBookingPhotoBody = z.infer<typeof FeatureBookingPhotoBodySchema>;

// Accepts either an already-permanent hotsite image (tenants/<id>/hotsite/...) or a not-yet
// promoted tmp/ staging upload (tmp/<id>/...) — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
export const DeleteHotsiteImageBodySchema = z.object({
  filePath: z
    .string()
    .regex(new RegExp(`^(tenants/[^/]+/hotsite/.+|${HOTSITE_TMP_PATH_FRAGMENT})$`)),
});

export type DeleteHotsiteImageBody = z.infer<typeof DeleteHotsiteImageBodySchema>;
