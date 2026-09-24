import { z } from 'zod';
import { ScheduleDayGridQuerySchema } from '@ikaro/validation';

// Request Zod schema and its inferred query type — split out of
// schedule-day-grid.controller.ts so request-side shapes never live inline in the controller
// (mirrors schedule-availability-summary.schemas.ts's existing split). Shared verbatim with the
// backend's GetScheduleDayGridSchema — see @ikaro/validation booking.ts.
export const GetDayGridQuerySchema = ScheduleDayGridQuerySchema;

export type GetDayGridQuery = z.infer<typeof GetDayGridQuerySchema>;
