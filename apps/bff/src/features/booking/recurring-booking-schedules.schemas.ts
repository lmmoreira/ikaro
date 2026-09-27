import { z } from 'zod';
import { RecurrenceRuleSchema } from '@ikaro/validation';

// Re-exported so existing imports of this symbol from this file keep working unchanged — the
// backend DTO and this BFF schema need it identically (bad-smell-audit BFF-5), so it lives once
// in packages/validation/src/booking.ts instead of two hand-written copies.
export { RecurrenceRuleSchema };

export const RequestRecurringBookingScheduleBodySchema = z.object({
  serviceId: z.uuid(),
  recurrence: RecurrenceRuleSchema,
  assignmentPolicy: z.enum(['FIXED_ASSIGNMENT', 'RESOLVE_PER_OCCURRENCE']),
  resourceIds: z.array(z.uuid()).length(1).optional(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().optional(),
  customerId: z.uuid().optional(),
});

export type RequestRecurringBookingScheduleBody = z.infer<
  typeof RequestRecurringBookingScheduleBodySchema
>;

export const SkipOrRescheduleOccurrenceBodySchema = z.object({
  action: z.enum(['SKIP', 'RESCHEDULE']),
  replacementBookingId: z.uuid().optional(),
  reason: z.string().max(255).optional(),
});

export type SkipOrRescheduleOccurrenceBody = z.infer<typeof SkipOrRescheduleOccurrenceBodySchema>;
