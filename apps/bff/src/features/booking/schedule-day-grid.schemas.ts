import { z } from 'zod';

// Request Zod schema and its inferred query type — split out of
// schedule-day-grid.controller.ts so request-side shapes never live inline in the controller
// (mirrors schedule-availability-summary.schemas.ts's existing split).
export const GetDayGridQuerySchema = z.object({
  date: z.iso.date({ error: 'date must be a valid YYYY-MM-DD calendar date' }),
});

export type GetDayGridQuery = z.infer<typeof GetDayGridQuerySchema>;
