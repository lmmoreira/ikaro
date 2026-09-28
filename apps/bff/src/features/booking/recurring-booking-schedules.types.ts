import { RecurrenceRuleSchema } from './recurring-booking-schedules.schemas';
import { z } from 'zod';

export type RecurrenceRuleResponse = z.infer<typeof RecurrenceRuleSchema>;

export interface RecurringBookingScheduleResponse {
  id: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: string | null;
}

export interface RecurringBookingScheduleListItem {
  id: string;
  customerId: string;
  serviceId: string;
  recurrence: RecurrenceRuleResponse;
  startsOn: string;
  endsOn: string | null;
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  approvalHoldExpiresAt: string | null;
}

export interface RecurringBookingScheduleListResponse {
  items: RecurringBookingScheduleListItem[];
}

export interface SkipOrRescheduleOccurrenceResponse {
  scheduleId: string;
  occurrenceStart: string;
  kind: 'SKIPPED' | 'RESCHEDULED';
}

export interface PauseRecurringBookingScheduleResponse {
  id: string;
  status: 'PAUSED';
}

export interface EndRecurringBookingScheduleResponse {
  id: string;
  status: 'CANCELLED';
  cancelledBookingIds: string[];
}
