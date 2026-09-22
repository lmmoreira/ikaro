import { z } from 'zod';
import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import {
  HotsiteBrandingSchema,
  HotsiteModuleSchema,
  HotsiteSeoSchema,
  LeadFormAudienceModeSchema,
  LeadFormQuestionSchema,
} from '@ikaro/validation';

// audienceMode/questions (M20-S01, folded into this consolidated endpoint at M20-S08 — see
// UpdateHotsiteContentUseCase's own header comment) write LeadFormConfig, a separate aggregate
// from HotsiteConfig — never persisted into layout[]'s LEAD_FORM entry itself, which stays
// public-manifest-cacheable and must never carry admin-only audience/question data.
export const UpdateHotsiteContentSchema = z
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
  });

export type UpdateHotsiteContentDto = z.infer<typeof UpdateHotsiteContentSchema>;
