import type { RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import type { TenantBookingWindow } from '../ports/booking-platform.port';
import type { RecurringResourceSelection } from './recurring-service-requirement.helpers';

export interface RequestRecurringBookingScheduleUseCaseInput {
  tenantId: string;
  correlationId: string;
  timezone: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  // One entry per CUSTOMER_CHOICE requirement of the service; the assignment policy is derived from
  // the service, never taken from the caller (TD49 Story 0).
  resourceSelections: RecurringResourceSelection[];
  actorType: 'CUSTOMER' | 'STAFF';
  actorId: string;
  // Present only when a STAFF actor creates on the customer's behalf.
  bodyCustomerId?: string;
  // The tenant's booking window (`settings.booking`) — the ceiling the service's own override is
  // clamped to when the first occurrence is checked (M23-S35).
  tenantBookingWindow: TenantBookingWindow;
  // The customer's previous schedule this request may renew (M23-S35). Never stored.
  renewsScheduleId?: string;
}
