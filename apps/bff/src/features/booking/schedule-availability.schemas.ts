import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-availability.controller.ts so request-side shapes never live inline in the
// controller (mirrors booking/bookings.schemas.ts's existing split).
export const GetAvailabilityQuerySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'serviceIds is required'),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). Pass-through to
  // the backend's own optional resourceId (M21 Cluster 1, Codex PR #460 round-8 finding).
  resourceId: z.uuid().optional(),
});

export type GetAvailabilityQuery = z.infer<typeof GetAvailabilityQuerySchema>;
