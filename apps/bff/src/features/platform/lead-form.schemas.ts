import { z } from 'zod';
import { ListLeadFormSubmissionsSchema, UpdateLeadFormConfigSchema } from '@ikaro/validation';

export const UpdateLeadFormConfigBodySchema = UpdateLeadFormConfigSchema;
export type UpdateLeadFormConfigBody = z.infer<typeof UpdateLeadFormConfigBodySchema>;

// M20-S06 — shared with the backend's own list-lead-form-submissions.dto.ts (packages/validation
// src/lead-form-submission.ts) rather than a second hand-written copy (bad-smell-audit BFF-5
// finding); forwarded to the backend as-is via BackendHttpService.
export const ListLeadFormSubmissionsQuerySchema = ListLeadFormSubmissionsSchema;
export type ListLeadFormSubmissionsQuery = z.infer<typeof ListLeadFormSubmissionsQuerySchema>;
