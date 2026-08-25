import { z } from 'zod';

// Mirrors apps/backend/src/contexts/loyalty/application/dtos/pagination.dto.ts's exact bounds
// (page >= 1 default 1, size 1-100 default 20) — field renamed page/pageSize to match this
// feature's own already-locked API contract (docs/14-API_CONTRACTS.md § Leads Submissions).
export const ListLeadFormSubmissionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListLeadFormSubmissionsDto = z.infer<typeof ListLeadFormSubmissionsSchema>;
