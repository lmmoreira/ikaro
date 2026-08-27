import { z } from 'zod';
import { ListLeadFormSubmissionsSchema } from '@ikaro/validation';

// Config writes go through UpdateHotsiteContentBodySchema (hotsite-admin.schemas.ts) as of
// M20-S08 — audienceMode/questions are optional fields there, not a separate schema here.

// M20-S06 — shared with the backend's own list-lead-form-submissions.dto.ts (packages/validation
// src/lead-form-submission.ts) rather than a second hand-written copy (bad-smell-audit BFF-5
// finding); forwarded to the backend as-is via BackendHttpService.
export const ListLeadFormSubmissionsQuerySchema = ListLeadFormSubmissionsSchema;
export type ListLeadFormSubmissionsQuery = z.infer<typeof ListLeadFormSubmissionsQuerySchema>;
