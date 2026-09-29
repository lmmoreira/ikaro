import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { RecurrenceRule } from './recurrence-rule.helpers';
import { ResourceType } from './resource.types';

// Split out of recurring-booking-schedule.aggregate.ts to stay under docs/CODE_STANDARDS.md's
// file-length limit — pure type/interface declarations, no logic (mirrors service.types.ts's own
// split precedent).
export type RecurringBookingScheduleStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type RecurringBookingScheduleAssignmentPolicy =
  'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
export type RecurringBookingScheduleCancellationReason =
  'CUSTOMER_CANCELLED' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED';
export type RecurringBookingScheduleExceptionKind = 'SKIPPED' | 'RESCHEDULED';
export type RecurringBookingScheduleActorType = 'CUSTOMER' | 'STAFF';

export interface RecurringBookingScheduleResourceAssignmentProps {
  resourceId: string;
  resourceType: ResourceType;
  requirementId: string | null;
  requiredQuantityPosition: number | null;
  assignedAt: Date;
}

export interface RecurringBookingScheduleExceptionProps {
  id: string;
  occurrenceStart: Date;
  kind: RecurringBookingScheduleExceptionKind;
  replacementBookingId: string | null;
  actorType: RecurringBookingScheduleActorType;
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

// Internal, in-aggregate shape of the recurrence pattern — startTime is a validated TimeOfDay
// here (architecture-check's aggregate-primitive-vo rule), unlike the wire-facing RecurrenceRule
// (DTOs, entity JSONB, domain events), which stores it as a plain "HH:mm" string. The aggregate's
// own `recurrence` getter converts back to the wire shape for those external consumers.
export interface RecurringBookingScheduleRecurrenceProps {
  frequency: 'WEEKLY';
  daysOfWeek: RecurrenceRule['daysOfWeek'];
  startTime: TimeOfDay;
  durationMinutes: number;
}

export interface RecurringBookingScheduleProps {
  id: string;
  tenantId: string;
  customerId: string;
  serviceId: string;
  recurrence: RecurringBookingScheduleRecurrenceProps;
  startsOn: string;
  endsOn: string;
  status: RecurringBookingScheduleStatus;
  assignmentPolicy: RecurringBookingScheduleAssignmentPolicy;
  resourceAssignments: RecurringBookingScheduleResourceAssignmentProps[];
  exceptions: RecurringBookingScheduleExceptionProps[];
  approvalHoldExpiresAt: Date | null;
  approvedByStaffId: string | null;
  approvedAt: Date | null;
  cancellationReason: RecurringBookingScheduleCancellationReason | null;
  createdByStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  // undefined = not yet persisted (mirrors booking.types.ts's own BookingProps.version
  // convention) — set by the repository via markPersisted() after a successful insert/update.
  version?: number;
}

export interface RequestRecurringBookingScheduleResourceAssignmentInput {
  resourceId: string;
  resourceType: ResourceType;
  requirementId: string | null;
  requiredQuantityPosition: number | null;
}

export interface RequestRecurringBookingScheduleOptions {
  tenantId: string;
  customerId: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  // The service's maximum term in days (Service.bookingPolicy.recurringHorizonDays, or the
  // platform default) — resolved by the use case, enforced here as the aggregate invariant.
  maxTermDays: number;
  assignmentPolicy: RecurringBookingScheduleAssignmentPolicy;
  resourceAssignments: RequestRecurringBookingScheduleResourceAssignmentInput[];
  // Pre-resolved by the use case (UpdateServiceBookingPolicyUseCase's resolveApprovalMode
  // precedent) — the aggregate only encodes the resulting status branch, not the tenant-settings
  // lookup that produced it.
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: Date | null;
  createdByStaffId: string | null;
  correlationId: string;
}
