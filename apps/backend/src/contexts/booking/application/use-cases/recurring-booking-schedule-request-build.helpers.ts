import { BookingCustomerNotFoundError } from '../../domain/errors/booking-domain.error';
import { RecurrenceOccurrence, RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleResourceAssignmentInput,
} from '../../domain/recurring-booking-schedule.aggregate';
import { Service } from '../../domain/service.aggregate';
import { IBookingCustomerPort } from '../ports/booking-customer.port';
import { IBookingStaffPort } from '../ports/booking-staff.port';
import { RecurringAssignmentPolicy } from './recurring-service-requirement.helpers';

// Everything RequestRecurringBookingScheduleUseCase derives from the service and the policy before
// it checks the term — split out of the use case for docs/CODE_STANDARDS.md's file-length limit.
export interface PreparedRecurringBookingScheduleRequest {
  service: Service;
  // The service's maximum term in days — validated against endsOn in prepareRequest() and passed
  // on to the aggregate, which enforces the same invariant.
  maxTermDays: number;
  occurrences: RecurrenceOccurrence[];
  assignmentPolicy: RecurringAssignmentPolicy;
  resourceAssignments: RequestRecurringBookingScheduleResourceAssignmentInput[];
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: Date | null;
  // A STAFF actor created it for a service that needs manual approval: the staff member approves
  // it by creating it (see resolveApprovalStatus).
  approvedByStaff: boolean;
}

export interface RequestedScheduleInput {
  tenantId: string;
  correlationId: string;
  serviceId: string;
  recurrence: RecurrenceRule;
  startsOn: string;
  endsOn: string;
  actorType: 'CUSTOMER' | 'STAFF';
  actorId: string;
}

export function buildRequestedSchedule(
  input: RequestedScheduleInput,
  customerId: string,
  prepared: PreparedRecurringBookingScheduleRequest,
): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: input.tenantId,
    customerId,
    serviceId: input.serviceId,
    recurrence: input.recurrence,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    maxTermDays: prepared.maxTermDays,
    assignmentPolicy: prepared.assignmentPolicy,
    resourceAssignments: prepared.resourceAssignments,
    status: prepared.status,
    approvalHoldExpiresAt: prepared.approvalHoldExpiresAt,
    createdByStaffId: input.actorType === 'STAFF' ? input.actorId : null,
    approvedByStaffId: prepared.approvedByStaff ? input.actorId : null,
    correlationId: input.correlationId,
  });
}

export interface CustomerResolutionInput {
  tenantId: string;
  actorType: 'CUSTOMER' | 'STAFF';
  actorId: string;
  // Present only when a STAFF actor creates on the customer's behalf.
  bodyCustomerId?: string;
}

export async function resolveRequestingCustomerId(
  ports: { staffPort: IBookingStaffPort; customerPort: IBookingCustomerPort },
  input: CustomerResolutionInput,
): Promise<string> {
  if (input.actorType === 'CUSTOMER') return input.actorId;

  // STAFF acting on the customer's behalf.
  const staff = await ports.staffPort.findActiveById(input.actorId, input.tenantId);
  if (!staff) throw new BookingCustomerNotFoundError(input.actorId);
  const customerId = input.bodyCustomerId;
  if (!customerId) throw new BookingCustomerNotFoundError('missing');
  const customer = await ports.customerPort.findById(customerId, input.tenantId);
  if (!customer) throw new BookingCustomerNotFoundError(customerId);
  return customerId;
}
