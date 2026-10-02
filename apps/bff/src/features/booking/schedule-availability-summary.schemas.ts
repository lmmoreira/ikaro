import { z } from 'zod';
import {
  DurationMinutesQuerySchema,
  isResourceIdExclusiveOfSelections,
  RESOURCE_ID_EXCLUDES_SELECTIONS_MESSAGE,
  ResourceSelectionsQueryStringSchema,
} from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-availability-summary.controller.ts so request-side shapes never live inline in the
// controller (mirrors booking/bookings.schemas.ts's existing split).
export const GetAvailabilitySummaryQuerySchema = z
  .object({
    from: z.iso.date({ error: 'from must be a valid YYYY-MM-DD calendar date' }),
    to: z.iso.date({ error: 'to must be a valid YYYY-MM-DD calendar date' }),
    serviceIds: z.string().min(1, 'serviceIds is required'),
    // Optional — omit for tenant-wide availability (today's behavior, unchanged). Pass-through to
    // the backend's own optional resourceId.
    resourceId: z.uuid().optional(),
    // Optional — the customer's picks for CUSTOMER_CHOICE requirements (validated here, forwarded to
    // the backend verbatim as the same comma-joined string) and the chosen duration of a
    // CUSTOMER_SELECTED service. The backend owns the domain validation of both.
    resourceSelections: ResourceSelectionsQueryStringSchema.optional(),
    durationMinutes: DurationMinutesQuerySchema.optional(),
  })
  .refine(isResourceIdExclusiveOfSelections, {
    error: RESOURCE_ID_EXCLUDES_SELECTIONS_MESSAGE,
    path: ['resourceSelections'],
  });

export type GetAvailabilitySummaryQuery = z.infer<typeof GetAvailabilitySummaryQuerySchema>;
