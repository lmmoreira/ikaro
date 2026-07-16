import { z } from 'zod';
import { PlatformErrorCode } from '@ikaro/types';
import { HotsiteBrandingSchema, HotsiteModuleSchema, HotsiteSeoSchema } from '@ikaro/validation';

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
