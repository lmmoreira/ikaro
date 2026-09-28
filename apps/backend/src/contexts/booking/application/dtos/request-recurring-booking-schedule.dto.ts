import { z } from 'zod';
import {
  RequestRecurringBookingScheduleBodySchema as RequestRecurringBookingScheduleSchema,
  SkipOrRescheduleOccurrenceBodySchema as SkipOrRescheduleOccurrenceSchema,
} from '@ikaro/validation';

// Re-exported so existing imports of these symbols from this file keep working unchanged — the
// backend DTO and the BFF schema need these identically (bad-smell-audit BFF-5), so they live
// once in packages/validation/src/booking.ts instead of hand-written copies per app.
export { RecurrenceRuleSchema, OccurrenceStartParamSchema } from '@ikaro/validation';
export { RequestRecurringBookingScheduleSchema, SkipOrRescheduleOccurrenceSchema };

export type RequestRecurringBookingScheduleDto = z.infer<
  typeof RequestRecurringBookingScheduleSchema
>;

export type SkipOrRescheduleOccurrenceDto = z.infer<typeof SkipOrRescheduleOccurrenceSchema>;
