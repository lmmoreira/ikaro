import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IBookingStaffPort } from '../ports/booking-staff.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IServiceIntakeSchemaRepository } from '../ports/service-intake-schema-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';
import {
  BookingItineraryLegDetail,
  BookingLineResourceEntryDetail,
  buildBookingDetailResources,
} from './booking-detail-resources.helpers';

export interface BookingDetailAttendeeDetail {
  name: string;
  isMinor: boolean;
}

export interface BookingDetailIntakeAnswerDetail {
  fieldKey: string;
  label: string;
  type: 'FREE_TEXT' | 'BOOLEAN';
  value: string | boolean;
}

export interface BookingDetailIntakeDetail {
  schemaVersion: number;
  answers: BookingDetailIntakeAnswerDetail[];
  consentAcceptedAt: string | null;
  consentVersion: number | null;
}

// Cancel / reject facts of a terminal booking, read from the aggregate itself (never rebuilt from
// the status history, which has no backfill). `byCustomer` is true when the booking's own customer
// cancelled it; the actor id and name are for the staff-facing read only. `byExpiry` is true when
// the system cancelled an unanswered manual-approval request (TD51): there is no actor and the
// stored reason is a marker, not text anyone wrote, so `reason` is null.
export interface BookingTerminationDetail {
  at: string;
  reason: string | null;
  byCustomer: boolean;
  byExpiry: boolean;
  actorId: string | null;
  actorName: string | null;
}

// Everything the full booking detail adds (M23-S47). Loaded only when the caller asks for it
// (`includeDetailExtras`), so the loyalty adapter's read of the same use case never pays for it.
export interface BookingDetailExtras {
  resources: BookingLineResourceEntryDetail[] | null;
  itinerary: BookingItineraryLegDetail[] | null;
  participantCount: number | null;
  attendees: BookingDetailAttendeeDetail[] | null;
  intake: BookingDetailIntakeDetail | null;
  recurringScheduleId: string | null;
  createdByStaffId: string | null;
  createdByName: string | null;
  cancellation: BookingTerminationDetail | null;
  rejection: BookingTerminationDetail | null;
}

export const EMPTY_BOOKING_DETAIL_EXTRAS: BookingDetailExtras = {
  resources: null,
  itinerary: null,
  participantCount: null,
  attendees: null,
  intake: null,
  recurringScheduleId: null,
  createdByStaffId: null,
  createdByName: null,
  cancellation: null,
  rejection: null,
};

export interface BookingDetailExtrasDeps {
  bookingRepo: IBookingRepository;
  serviceRepo: IServiceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  intakeSchemaRepo: IServiceIntakeSchemaRepository;
  staffPort: IBookingStaffPort;
  txManager: ITransactionManager;
}

export interface BookingDetailExtrasOptions {
  // Staff-facing reads only: resolves the names of the creator and of the cancelling or rejecting
  // staff member. A customer read skips the lookup entirely.
  includeActorNames: boolean;
}

// The labels are those of the schema version the booking was made on, not the active one; an
// answer whose key the version does not hold keeps its key as its label.
export function buildIntakeDetail(
  booking: Booking,
  schemas: readonly ServiceBookingIntakeSchema[],
): BookingDetailIntakeDetail | null {
  const snapshot = booking.intake;
  if (!snapshot) return null;
  const questions =
    schemas.find((s) => s.version === snapshot.intakeSchemaVersion)?.questions ?? [];
  const answers = Object.entries(snapshot.intakeAnswers).map(([fieldKey, value]) => {
    const question = questions.find((q) => q.fieldKey === fieldKey);
    return {
      fieldKey,
      label: question?.label ?? fieldKey,
      type: question?.type ?? (typeof value === 'boolean' ? 'BOOLEAN' : 'FREE_TEXT'),
      value,
      order: question ? questions.indexOf(question) : questions.length,
    };
  });
  answers.sort((a, b) => a.order - b.order);
  return {
    schemaVersion: snapshot.intakeSchemaVersion,
    answers: answers.map(({ order: _order, ...answer }) => answer),
    consentAcceptedAt: snapshot.consentAcceptedAt?.toISOString() ?? null,
    consentVersion: snapshot.consentVersion,
  };
}

function terminationOf(
  at: Date | null,
  reason: string | null,
  actorId: string | null,
  booking: Booking,
  names: ReadonlyMap<string, string | null>,
  byExpiry = false,
): BookingTerminationDetail | null {
  if (!at) return null;
  const byCustomer = booking.customerId !== null && actorId === booking.customerId;
  return {
    at: at.toISOString(),
    reason: byExpiry ? null : reason,
    byCustomer,
    byExpiry,
    actorId,
    actorName: actorNameOf(actorId, byCustomer, booking, names),
  };
}

function actorNameOf(
  actorId: string | null,
  byCustomer: boolean,
  booking: Booking,
  names: ReadonlyMap<string, string | null>,
): string | null {
  if (byCustomer) return booking.contactName;
  if (actorId === null) return null;
  return names.get(actorId) ?? null;
}

function staffIdsOf(booking: Booking): string[] {
  const ids = [booking.createdByStaffId, booking.cancelledBy, booking.rejectedBy];
  return [...new Set(ids.filter((id): id is string => id !== null && id !== booking.customerId))];
}

async function loadResources(deps: BookingDetailExtrasDeps, booking: Booking) {
  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  const assignments = await deps.bookingRepo.findLatestResourceAssignments(
    booking.tenantId,
    booking.id,
  );
  const hasLegs = assignments.some((a) => a.legIndex !== null);
  // The occupancy rows only carry the leg times, and a cancel or reject has already deleted them.
  const releasable =
    booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.REJECTED;
  const [services, occupancyRows] = await Promise.all([
    deps.serviceRepo.findByIds(serviceIds, booking.tenantId),
    hasLegs && !releasable
      ? // The occupancy repository only works inside a transaction, reads included.
        deps.txManager.run(() =>
          deps.occupancyRepo.findOccupancyByBookingLines(
            booking.tenantId,
            booking.lines.map((line) => line.lineId),
          ),
        )
      : Promise.resolve([]),
  ]);
  return buildBookingDetailResources({
    booking,
    serviceMap: new Map(services.map((service) => [service.id, service])),
    assignments,
    occupancyRows,
  });
}

// The booking stores the intake version but not which service owns it, and a basket may hold
// several services (only one of them had an active schema when it was booked). That service is the
// one whose booked version was its newest version at booking time; a schema published after the
// booking, even with the same version number, cannot be it.
export function pickBookedIntakeSchemas(
  booking: Booking,
  schemasByService: readonly (readonly ServiceBookingIntakeSchema[])[],
): readonly ServiceBookingIntakeSchema[] {
  const bookedVersion = booking.intake?.intakeSchemaVersion;
  const newestAtBooking = (schemas: readonly ServiceBookingIntakeSchema[]) =>
    schemas
      .filter((schema) => schema.createdAt <= booking.createdAt)
      .reduce((max, schema) => Math.max(max, schema.version), 0);
  return schemasByService.find((schemas) => newestAtBooking(schemas) === bookedVersion) ?? [];
}

async function loadIntake(deps: BookingDetailExtrasDeps, booking: Booking) {
  if (!booking.intake) return null;
  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  // One query for the whole basket, then grouped back per service.
  const schemas = await deps.intakeSchemaRepo.findAllByServiceIds(serviceIds, booking.tenantId);
  const schemasByService = serviceIds.map((id) => schemas.filter((s) => s.serviceId === id));
  return buildIntakeDetail(booking, pickBookedIntakeSchemas(booking, schemasByService));
}

export async function loadBookingDetailExtras(
  deps: BookingDetailExtrasDeps,
  booking: Booking,
  options: BookingDetailExtrasOptions,
): Promise<BookingDetailExtras> {
  const staffIds = options.includeActorNames ? staffIdsOf(booking) : [];
  const [{ resources, itinerary }, intake, names] = await Promise.all([
    loadResources(deps, booking),
    loadIntake(deps, booking),
    staffIds.length > 0
      ? deps.staffPort.findNamesByIds(staffIds, booking.tenantId)
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  return {
    resources,
    itinerary,
    participantCount: booking.participantCount,
    attendees: booking.attendees.map((a) => ({ name: a.name, isMinor: a.isMinor })),
    intake,
    recurringScheduleId: booking.recurringScheduleId,
    createdByStaffId: booking.createdByStaffId,
    createdByName: booking.createdByStaffId ? (names.get(booking.createdByStaffId) ?? null) : null,
    cancellation: terminationOf(
      booking.cancelledAt,
      booking.cancellationReason,
      booking.cancelledBy,
      booking,
      names,
      booking.cancelledByHoldExpiry,
    ),
    rejection: terminationOf(
      booking.rejectedAt,
      booking.rejectionReason,
      booking.rejectedBy,
      booking,
      names,
    ),
  };
}
