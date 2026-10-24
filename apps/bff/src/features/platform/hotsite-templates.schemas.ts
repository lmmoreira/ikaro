import { z } from 'zod';
import { HotsiteBrandingSchema, HotsiteModuleSchema, HotsiteSeoSchema } from '@ikaro/validation';

// Request shape of POST /tenants/hotsite/templates/:templateId/apply — the manager's current
// (possibly unsaved) draft, image fields as storage paths exactly like a PATCH. The backend
// maintains the same schema independently (apply-hotsite-template.dto.ts); keep them in step.
export const ApplyHotsiteTemplateBodySchema = z.object({
  content: z.object({
    branding: HotsiteBrandingSchema.default({}),
    layout: z.array(HotsiteModuleSchema),
    seo: HotsiteSeoSchema.default({}),
  }),
});

export type ApplyHotsiteTemplateBody = z.infer<typeof ApplyHotsiteTemplateBodySchema>;

// A catalogue id is a short kebab-case slug; anything else cannot be a template, so it is rejected
// here instead of being forwarded into a backend URL path.
export const HotsiteTemplateIdParamSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
