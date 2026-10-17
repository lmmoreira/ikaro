import {
  BookingActorRef,
  BookingLineResourceEntry,
  CustomerBookingCancellation,
  CustomerBookingDetailResponse,
  CustomerBookingRejection,
  StaffBookingDetailResponse,
  StaffBookingTermination,
} from '@ikaro/types';
import { BackendBookingTermination, BookingDetailResponse } from './bookings.types';

// The full booking detail (M23-S47) is one backend read with two audiences. These two mappers pick
// each audience's subset of it; keeping them here keeps bookings.mapper.ts under the file cap.

type StaffDetailExtras = Pick<
  StaffBookingDetailResponse,
  | 'notes'
  | 'adminNotes'
  | 'createdAt'
  | 'createdByName'
  | 'resources'
  | 'itinerary'
  | 'participantCount'
  | 'attendees'
  | 'intake'
  | 'recurringScheduleId'
  | 'cancellation'
  | 'rejection'
>;

type CustomerDetailExtras = Pick<
  CustomerBookingDetailResponse,
  | 'pickupAddress'
  | 'resources'
  | 'itinerary'
  | 'participantCount'
  | 'attendees'
  | 'intake'
  | 'recurringScheduleId'
  | 'cancellation'
  | 'rejection'
>;

function toStaffTermination(
  termination: BackendBookingTermination | null,
  kind: BookingActorRef['kind'],
): StaffBookingTermination | null {
  if (!termination) return null;
  return {
    at: termination.at,
    reason: termination.reason,
    by: { kind, name: termination.actorName },
  };
}

function cancellationKind(cancellation: BackendBookingTermination | null): BookingActorRef['kind'] {
  if (cancellation?.byExpiry) return 'SYSTEM';
  return cancellation?.byCustomer ? 'CUSTOMER' : 'STAFF';
}

export function toStaffDetailExtras(detail: BookingDetailResponse): StaffDetailExtras {
  const { cancellation, rejection, intake } = detail;
  return {
    notes: detail.notes,
    adminNotes: detail.adminNotes,
    createdAt: detail.createdAt,
    createdByName: detail.createdByName,
    resources: detail.resources ?? [],
    itinerary: detail.itinerary ?? [],
    participantCount: detail.participantCount,
    attendees: detail.attendees ?? [],
    intake: intake ? { ...intake } : null,
    recurringScheduleId: detail.recurringScheduleId,
    cancellation: toStaffTermination(cancellation, cancellationKind(cancellation)),
    rejection: toStaffTermination(rejection, 'STAFF'),
  };
}

function toCustomerCancellation(
  cancellation: BackendBookingTermination | null,
): CustomerBookingCancellation | null {
  if (!cancellation) return null;
  return {
    at: cancellation.at,
    byCustomer: cancellation.byCustomer,
    expired: cancellation.byExpiry,
    // A customer's own cancel stores no reason, and the customer is only told a reason the
    // establishment gave (the same rule as the cancellation email).
    reason: cancellation.byCustomer || cancellation.byExpiry ? null : cancellation.reason,
  };
}

function toCustomerRejection(
  rejection: BackendBookingTermination | null,
): CustomerBookingRejection | null {
  return rejection ? { at: rejection.at, reason: rejection.reason } : null;
}

// A customer sees a resource's identity only when its requirement lets them choose it or shows the
// automatic pick (UC-062/063). A named resource with no origin belongs to a requirement the service
// no longer declares, so it stays hidden; a fungible pool already carries no name.
// The itinerary is deliberately not filtered this way: UC-065 reveals every leg's resource to the
// customer whatever the leg's selection mode (the create response already shows it), so a later
// change of the service's legs does not retroactively hide what the customer was shown.
function isDisclosableToCustomer(entry: BookingLineResourceEntry): boolean {
  return entry.origin !== null || entry.resourceName === null;
}

// Never carries `adminNotes`, `createdByStaffId`/`createdByName`, `consentVersion` or an actor id
// or name (negative guarantee, pinned by its own test).
export function toCustomerDetailExtras(detail: BookingDetailResponse): CustomerDetailExtras {
  return {
    pickupAddress: detail.pickupAddress,
    resources: (detail.resources ?? []).filter(isDisclosableToCustomer),
    itinerary: detail.itinerary ?? [],
    participantCount: detail.participantCount,
    attendees: detail.attendees ?? [],
    intake: detail.intake
      ? {
          schemaVersion: detail.intake.schemaVersion,
          answers: detail.intake.answers,
          consentAcceptedAt: detail.intake.consentAcceptedAt,
        }
      : null,
    recurringScheduleId: detail.recurringScheduleId,
    cancellation: toCustomerCancellation(detail.cancellation),
    rejection: toCustomerRejection(detail.rejection),
  };
}
