import { z } from 'zod';

// Mirrors apps/backend's RecurrenceRuleSchema — WEEKLY-only for MVP (M23-S04 story-discovery,
// 2026-09-27). BFF maintains its own copy per docs/24-BFF_ARCHITECTURE.md — the backend is the
// authoritative validator.
export const RecurrenceRuleSchema = z.object({
  frequency: z.literal('WEEKLY'),
  daysOfWeek: z
    .array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']))
    .min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm'),
  durationMinutes: z.number().int().positive(),
});

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
