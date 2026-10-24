import { z } from 'zod';
import { HotsiteBrandingSchema, HotsiteSeoSchema } from './hotsite';
import { HotsiteModuleSchema } from './hotsite-modules';

// The request of POST /tenants/hotsite/templates/:templateId/apply (TD56-S04): the manager's current
// (possibly unsaved) draft, image fields as storage paths exactly like a PATCH. One schema for the
// backend DTO and the BFF body — they had been two field-for-field identical copies.
export const ApplyHotsiteTemplateSchema = z.object({
  content: z.object({
    branding: HotsiteBrandingSchema.default({}),
    layout: z.array(HotsiteModuleSchema),
    seo: HotsiteSeoSchema.default({}),
  }),
});

export type ApplyHotsiteTemplateInput = z.infer<typeof ApplyHotsiteTemplateSchema>;
