import { z } from 'zod';

// Request Zod schema and its inferred query type — split out of
// schedule-availability-summary.controller.ts so request-side shapes never live inline in the
// controller (mirrors booking/bookings.schemas.ts's existing split).
export const GetAvailabilitySummaryQuerySchema = z.object({
  from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
  to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
  serviceIds: z.string().min(1, 'serviceIds is required'),
  // Optional — omit for tenant-wide availability (today's behavior, unchanged). Pass-through to
  // the backend's own optional resourceId.
  resourceId: z.uuid().optional(),
});

export type GetAvailabilitySummaryQuery = z.infer<typeof GetAvailabilitySummaryQuerySchema>;
