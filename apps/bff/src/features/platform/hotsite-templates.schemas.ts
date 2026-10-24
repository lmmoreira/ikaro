import { z } from 'zod';
import { ApplyHotsiteTemplateSchema } from '@ikaro/validation';

// Request shape of POST /tenants/hotsite/templates/:templateId/apply — the manager's current
// (possibly unsaved) draft, image fields as storage paths exactly like a PATCH. The schema is the
// shared one in @ikaro/validation, used unchanged by the backend DTO.
export const ApplyHotsiteTemplateBodySchema = ApplyHotsiteTemplateSchema;

export type ApplyHotsiteTemplateBody = z.infer<typeof ApplyHotsiteTemplateBodySchema>;

// A catalogue id is a short kebab-case slug; anything else cannot be a template, so it is rejected
// here instead of being forwarded into a backend URL path.
export const HotsiteTemplateIdParamSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
