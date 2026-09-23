import { z } from 'zod';
import { DATE_ONLY_PATTERN } from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-day-grid.controller.ts so request-side shapes never live inline in the controller
// (mirrors schedule-availability-summary.schemas.ts's existing split).
export const GetDayGridQuerySchema = z.object({
  date: z.string().regex(DATE_ONLY_PATTERN, 'date must be YYYY-MM-DD'),
});

export type GetDayGridQuery = z.infer<typeof GetDayGridQuerySchema>;
