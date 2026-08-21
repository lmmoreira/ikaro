import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-availability.controller.ts so request-side shapes never live inline in the
// controller (TD37-S10, mirrors booking/bookings.schemas.ts's existing split).
export const GetAvailabilityQuerySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
  serviceIds: z.string().min(1, 'serviceIds is required'),
});

export type GetAvailabilityQuery = z.infer<typeof GetAvailabilityQuerySchema>;
