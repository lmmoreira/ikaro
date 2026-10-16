import {
  BookingActorRef,
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
    cancellation: toStaffTermination(cancellation, cancellation?.byCustomer ? 'CUSTOMER' : 'STAFF'),
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
    // A customer's own cancel stores no reason, and the customer is only told a reason the
    // establishment gave (the same rule as the cancellation email).
    reason: cancellation.byCustomer ? null : cancellation.reason,
  };
}

function toCustomerRejection(
  rejection: BackendBookingTermination | null,
): CustomerBookingRejection | null {
  return rejection ? { at: rejection.at, reason: rejection.reason } : null;
}

// Never carries `adminNotes`, `createdByStaffId`/`createdByName`, `consentVersion` or an actor id
// or name (negative guarantee, pinned by its own test).
export function toCustomerDetailExtras(detail: BookingDetailResponse): CustomerDetailExtras {
  return {
    pickupAddress: detail.pickupAddress,
    resources: detail.resources ?? [],
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
