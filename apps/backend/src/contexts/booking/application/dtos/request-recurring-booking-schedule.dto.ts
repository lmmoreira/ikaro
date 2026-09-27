import { z } from 'zod';
import { RecurrenceRuleSchema } from '@ikaro/validation';

// Re-exported so existing imports of this symbol from this file keep working unchanged.
export { RecurrenceRuleSchema };

export const RequestRecurringBookingScheduleSchema = z
  .object({
    serviceId: z.uuid(),
    recurrence: RecurrenceRuleSchema,
    assignmentPolicy: z.enum(['FIXED_ASSIGNMENT', 'RESOLVE_PER_OCCURRENCE']),
    // Exactly one resource — recurring schedules are single-resource-only for this story
    // (bundle/multi-leg recurrence is out of scope). Required iff assignmentPolicy =
    // FIXED_ASSIGNMENT; ignored otherwise.
    resourceIds: z.array(z.uuid()).length(1).optional(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date().nullable().optional(),
    // Present only when STAFF|MANAGER creates on a customer's behalf — CUSTOMER callers always
    // act on their own customerId (taken from the JWT, never this field).
    customerId: z.uuid().optional(),
  })
  .refine(
    (body) => body.assignmentPolicy !== 'FIXED_ASSIGNMENT' || body.resourceIds?.length === 1,
    {
      message: 'resourceIds is required (exactly one) when assignmentPolicy is FIXED_ASSIGNMENT',
      path: ['resourceIds'],
    },
  );

export type RequestRecurringBookingScheduleDto = z.infer<
  typeof RequestRecurringBookingScheduleSchema
>;

export const SkipOrRescheduleOccurrenceSchema = z
  .object({
    action: z.enum(['SKIP', 'RESCHEDULE']),
    replacementBookingId: z.uuid().optional(),
    reason: z.string().max(255).optional(),
  })
  .refine((body) => body.action !== 'RESCHEDULE' || !!body.replacementBookingId, {
    message: 'replacementBookingId is required when action is RESCHEDULE',
    path: ['replacementBookingId'],
  });

export type SkipOrRescheduleOccurrenceDto = z.infer<typeof SkipOrRescheduleOccurrenceSchema>;
