import { z } from 'zod';
import { HotsiteBrandingSchema, HotsiteModuleSchema, HotsiteSeoSchema } from '@ikaro/validation';

// The manager's current (possibly unsaved) draft. Applying a template is a pure function of this
// value, the tenant from the JWT and that tenant's language — never of the saved config. Image
// fields arrive as storage paths, exactly like a PATCH (the web strips resolved URLs first).
export const ApplyHotsiteTemplateSchema = z.object({
  content: z.object({
    branding: HotsiteBrandingSchema.default({}),
    layout: z.array(HotsiteModuleSchema),
    seo: HotsiteSeoSchema.default({}),
  }),
});

export type ApplyHotsiteTemplateDto = z.infer<typeof ApplyHotsiteTemplateSchema>;
