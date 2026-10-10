import { Booking } from '../../domain/booking.aggregate';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
import { IBookingStaffPort } from '../ports/booking-staff.port';
import { IBookingStatusTransitionRepository } from '../ports/booking-status-transition-repository.port';

// One status change of the booking (M23-S27). `actorName` is the staff member's name (STAFF /
// MANAGER) or the booking's contact name (CUSTOMER); it is null for a GUEST or SYSTEM actor and for
// a staff member who cannot be resolved or has no name, and the web then shows a role label.
export interface BookingStatusHistoryEntryDetail {
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  occurredAt: string;
}

export function collectStaffActorIds(transitions: readonly BookingStatusTransition[]): string[] {
  return transitions
    .filter((t) => t.actorType === 'STAFF' || t.actorType === 'MANAGER')
    .map((t) => t.actorId)
    .filter((id): id is string => id !== null);
}

function resolveActorName(
  transition: BookingStatusTransition,
  booking: Booking,
  staffNames: ReadonlyMap<string, string | null>,
): string | null {
  switch (transition.actorType) {
    case 'STAFF':
    case 'MANAGER':
      return transition.actorId ? (staffNames.get(transition.actorId) ?? null) : null;
    case 'CUSTOMER':
      return booking.contactName;
    default:
      return null;
  }
}

export function toStatusHistory(
  transitions: readonly BookingStatusTransition[],
  booking: Booking,
  staffNames: ReadonlyMap<string, string | null>,
): BookingStatusHistoryEntryDetail[] {
  return transitions.map((t) => ({
    fromStatus: t.fromStatus,
    toStatus: t.toStatus,
    reason: t.reason,
    actorType: t.actorType,
    actorId: t.actorId,
    actorName: resolveActorName(t, booking, staffNames),
    occurredAt: t.occurredAt.toISOString(),
  }));
}

export async function loadStatusHistory(
  transitionRepo: IBookingStatusTransitionRepository,
  staffPort: IBookingStaffPort,
  booking: Booking,
): Promise<BookingStatusHistoryEntryDetail[]> {
  const transitions = await transitionRepo.findByBooking(booking.tenantId, booking.id);
  const staffNames = await staffPort.findNamesByIds(
    collectStaffActorIds(transitions),
    booking.tenantId,
  );
  return toStatusHistory(transitions, booking, staffNames);
}
