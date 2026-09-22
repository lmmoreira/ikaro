import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-availability-summary.controller.ts so request-side shapes never live inline in the
// controller (mirrors booking/bookings.schemas.ts's existing split).
export const GetAvailabilitySummaryQuerySchema = z.object({
  from: z.string().regex(DATE_ONLY_PATTERN, 'from must be YYYY-MM-DD'),
  to: z.string().regex(DATE_ONLY_PATTERN, 'to must be YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'serviceIds is required'),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). Pass-through to
  // the backend's own optional resourceId.
  resourceId: z.uuid().optional(),
});

export type GetAvailabilitySummaryQuery = z.infer<typeof GetAvailabilitySummaryQuerySchema>;
