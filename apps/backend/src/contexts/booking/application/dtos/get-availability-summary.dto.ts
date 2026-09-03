import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

export const GetAvailabilitySummarySchema = z.object({
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
  serviceIds: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.uuid()).min(1, 'at least one serviceId is required')),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). When set, scopes
  // the calculation to that resource's own closures/openings/workingHours (M21 Cluster 1, Codex
  // PR #460 round-8 finding).
  resourceId: z.uuid().optional(),
});

export type GetAvailabilitySummaryDto = z.infer<typeof GetAvailabilitySummarySchema>;
