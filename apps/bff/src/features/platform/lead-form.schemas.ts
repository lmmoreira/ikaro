import { z } from 'zod';
import { UpdateLeadFormConfigSchema } from '@ikaro/validation';

export const UpdateLeadFormConfigBodySchema = UpdateLeadFormConfigSchema;
export type UpdateLeadFormConfigBody = z.infer<typeof UpdateLeadFormConfigBodySchema>;

// M20-S06 — mirrors the backend's own ListLeadFormSubmissionsSchema bounds exactly (page >= 1
// default 1, pageSize 1-100 default 20); forwarded to the backend as-is via BackendHttpService.
export const ListLeadFormSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListLeadFormSubmissionsQuery = z.infer<typeof ListLeadFormSubmissionsQuerySchema>;
