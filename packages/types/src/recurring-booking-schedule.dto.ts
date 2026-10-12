import type { ResourceType } from './enums';
import type { Pagination } from './pagination';

export type RecurringScheduleWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type RecurringScheduleStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'CANCELLED' | 'ENDED';
export type RecurringScheduleAssignmentPolicy = 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';

// WEEKLY only for the MVP — mirrors RecurrenceRuleSchema in @ikaro/validation.
export interface RecurrenceRule {
  frequency: 'WEEKLY';
  daysOfWeek: RecurringScheduleWeekday[];
  startTime: string; // HH:mm, tenant-local
  durationMinutes: number;
}

// One recurring schedule as the backend returns it (UC-070/UC-071): an item of
// GET /recurring-booking-schedules and the body of GET /recurring-booking-schedules/:id.
// `serviceName` is the service's current name (the schedule only stores its id).
export interface RecurringScheduleResourceAssignment {
  resourceType: ResourceType;
  resourceId: string;
}

export interface RecurringBookingScheduleListItem {
  id: string;
  customerId: string;
  serviceId: string;
  serviceName: string;
  recurrence: RecurrenceRule;
  startsOn: string; // YYYY-MM-DD
  endsOn: string; // YYYY-MM-DD
  status: RecurringScheduleStatus;
  assignmentPolicy: RecurringScheduleAssignmentPolicy;
  // The current resource assignments: one entry for FIXED_ASSIGNMENT, empty for RESOLVE_PER_OCCURRENCE.
  // Optional so a consumer that reads an older response (a rolling deploy) still type-checks.
  resourceIds?: string[];
  // The same stored picks with their resource type (TD49 Story 1): only the CUSTOMER_CHOICE
  // requirements of the service, so a bundle lists its fixed staff member but not the room an
  // AUTO_* requirement resolves per occurrence (that one varies and lives on the occurrence
  // bookings). Optional for the same rolling-deploy reason as resourceIds.
  resourceAssignments?: RecurringScheduleResourceAssignment[];
  approvalHoldExpiresAt: string | null;
  // Whether the customer can renew it now (M23-S21): an ACTIVE schedule inside the tenant's renewal
  // window or an ENDED one, with no successor. Computed server-side; a customer cannot read the
  // tenant settings the window comes from. Optional so a consumer reading an older response (a
  // rolling deploy) still type-checks.
  renewable?: boolean;
}

export interface RecurringBookingScheduleListResponse {
  items: RecurringBookingScheduleListItem[];
  pagination: Pagination;
}

export interface RecurringScheduleResourceSelection {
  resourceType: 'LOCATION' | 'STAFF' | 'ROOM' | 'EQUIPMENT';
  resourceId: string;
}

// POST /recurring-booking-schedules — mirrors RequestRecurringBookingScheduleBodySchema in
// @ikaro/validation (apps/web never consumes that package). `resourceSelections` has one entry per
// CUSTOMER_CHOICE requirement of the service (none otherwise); the server derives the assignment
// policy. `customerId` is for a staff-side creation on a customer's behalf (a customer's own request
// never sends it).
export interface CreateRecurringBookingScheduleRequest {
  serviceId: string;
  recurrence: RecurrenceRule;
  resourceSelections?: RecurringScheduleResourceSelection[];
  startsOn: string; // YYYY-MM-DD, tenant-local
  endsOn: string; // YYYY-MM-DD, tenant-local
  customerId?: string;
  // The customer's previous schedule this request renews; the backend decides whether it qualifies.
  renewsScheduleId?: string;
}

// 201 body: ACTIVE when the service auto-confirms, PENDING_APPROVAL (with the hold's end) when it
// needs staff approval.
export interface CreateRecurringBookingScheduleResponse {
  id: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: string | null;
}
