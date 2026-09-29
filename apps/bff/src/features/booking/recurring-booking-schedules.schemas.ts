import { z } from 'zod';
import {
  ListRecurringBookingSchedulesQuerySchema,
  RequestRecurringBookingScheduleBodySchema,
  SkipOrRescheduleOccurrenceBodySchema,
} from '@ikaro/validation';

// Re-exported so existing imports of these symbols from this file keep working unchanged — the
// backend DTO and this BFF schema need them identically (bad-smell-audit BFF-5), so they live
// once in packages/validation/src/booking.ts instead of hand-written copies per app.
export { RecurrenceRuleSchema, OccurrenceStartParamSchema } from '@ikaro/validation';
export {
  ListRecurringBookingSchedulesQuerySchema,
  RequestRecurringBookingScheduleBodySchema,
  SkipOrRescheduleOccurrenceBodySchema,
};

export type ListRecurringBookingSchedulesQuery = z.infer<
  typeof ListRecurringBookingSchedulesQuerySchema
>;

export type RequestRecurringBookingScheduleBody = z.infer<
  typeof RequestRecurringBookingScheduleBodySchema
>;

export type SkipOrRescheduleOccurrenceBody = z.infer<typeof SkipOrRescheduleOccurrenceBodySchema>;
