import { Booking } from '../../domain/booking.aggregate';
import { BookingLineInput } from '../../domain/booking-line.entity';
import {
  BookingCustomerNotFoundError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceRequirementSelectionMode } from '../../domain/resource-requirement';
import { Resource } from '../../domain/resource.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { CustomerProfileDto, IBookingCustomerPort } from '../ports/booking-customer.port';
import { IBookingRepository } from '../ports/booking-repository.port';
import {
  BookingLineOccupancyAssignment,
  IResourceOccupancyRepository,
  ResourceOccupancyCandidate,
} from '../ports/resource-occupancy-repository.port';
import { buildLineInputs } from './booking-request.mapper';
import { effectiveRequirements } from './recurring-service-requirement.helpers';

export interface MaterializeOccurrencesDeps {
  bookingRepo: IBookingRepository;
  customerPort: IBookingCustomerPort;
  occupancyRepo: IResourceOccupancyRepository;
  availabilityService: AvailabilityService;
}

export interface MaterializeOccurrencesParams {
  schedule: RecurringBookingSchedule;
  service: Service;
  occurrences: RecurrenceOccurrence[];
  // The resources each occurrence is assigned to, in occurrence order — one per requirement of the
  // service, in its order: the plan assertPatternConflictFree() returns for the same term.
  resources: Resource[][];
  // The approving staff member; null when the schedule auto-confirmed at creation.
  approvedByStaffId: string | null;
}

type ContactProfile = CustomerProfileDto & { phone: string };

// UC-070 step 3 / UC-071 step 3 — creates one linked, directly-APPROVED booking per occurrence of
// the schedule's term and commits its resource occupancy, in bulk: every booking (with its lines)
// in one insert, every assignment and occupancy row in two more, however long the term is. The
// resource of each occurrence was already decided by the conflict check that accepted the term, so
// nothing is resolved or re-checked here; the exclusion constraint on resource_occupancy stays the
// last safety net.
//
// A plain function called from inside the caller's ITransactionManager.run(): it must never open a
// transaction of its own, because run() always starts a new, independent one (it does not join the
// caller's), which would break "the status change and every occurrence commit together".
// Returns the created booking ids.
export async function materializeRecurringScheduleOccurrences(
  deps: MaterializeOccurrencesDeps,
  params: MaterializeOccurrencesParams,
): Promise<string[]> {
  const { schedule, service, occurrences, resources } = params;
  const contact = await loadContact(deps.customerPort, schedule);
  const lineInputs = buildLineInputs([service.id], new Map([[service.id, service]]), {
    serviceId: service.id,
    durationMinutes: schedule.recurrence.durationMinutes,
    priceAtBooking: service.price,
  });

  const bookings = occurrences.map(({ occurrenceStart }) =>
    buildOccurrenceBooking({ schedule, contact, lineInputs, occurrenceStart, params }),
  );
  await deps.bookingRepo.insertMany(bookings);

  await deps.occupancyRepo.assignMany(
    schedule.tenantId,
    bookings.map((booking, index): BookingLineOccupancyAssignment => ({
      bookingLineId: booking.lines[0].lineId,
      candidates: buildCandidates(
        deps.availabilityService,
        params,
        occurrences[index],
        resources[index],
      ),
    })),
    'COMMITTED',
    null,
  );
  return bookings.map((booking) => booking.id);
}

async function loadContact(
  customerPort: IBookingCustomerPort,
  schedule: RecurringBookingSchedule,
): Promise<ContactProfile> {
  const customer = await customerPort.findById(schedule.customerId, schedule.tenantId);
  if (!customer) throw new BookingCustomerNotFoundError(schedule.customerId);
  if (!customer.phone) throw new CustomerPhoneNotSetError();
  return { ...customer, phone: customer.phone };
}

function buildOccurrenceBooking(input: {
  schedule: RecurringBookingSchedule;
  contact: ContactProfile;
  lineInputs: BookingLineInput[];
  occurrenceStart: Date;
  params: MaterializeOccurrencesParams;
}): Booking {
  const { schedule, contact } = input;
  return Booking.materializeRecurringOccurrence({
    tenantId: schedule.tenantId,
    customerId: schedule.customerId,
    contactEmail: contact.email,
    contactName: contact.name,
    contactPhone: contact.phone,
    scheduledAt: input.occurrenceStart,
    lineInputs: input.lineInputs,
    recurringScheduleId: schedule.id,
    approvedBy: input.params.approvedByStaffId,
    contactAddress: contact.defaultAddress ?? undefined,
  });
}

// Every requirement of a recurring-eligible service has a quantity of one — its own, or the default
// LOCATION a service with none falls back to (effectiveRequirements, see assertServiceEligible) —
// so every occurrence holds one resource per requirement, each for the window plus that resource's
// own trailing buffer/turnover gap — the same window the conflict check used. With two or more
// requirements the rows are bundle members, as for a one-off booking.
function buildCandidates(
  availabilityService: AvailabilityService,
  params: MaterializeOccurrencesParams,
  occurrence: RecurrenceOccurrence,
  resources: Resource[],
): ResourceOccupancyCandidate[] {
  const requirements = effectiveRequirements(params.service);
  return resources.map((resource, index) =>
    buildCandidate(availabilityService, params, occurrence, {
      resource,
      selectionMode: requirements[index].selectionMode,
      isBundleMember: requirements.length > 1,
    }),
  );
}

function buildCandidate(
  availabilityService: AvailabilityService,
  params: MaterializeOccurrencesParams,
  occurrence: RecurrenceOccurrence,
  held: {
    resource: Resource;
    selectionMode: ResourceRequirementSelectionMode;
    isBundleMember: boolean;
  },
): ResourceOccupancyCandidate {
  const { schedule, service } = params;
  const { resource } = held;
  const end = new Date(
    occurrence.occurrenceStart.getTime() + schedule.recurrence.durationMinutes * 60_000,
  );
  const gap = availabilityService.resolveFlatGap(
    service.bufferAfterMinutes ?? 0,
    resource.turnoverMinutes,
  );
  return {
    resourceId: resource.id,
    resourceType: resource.type,
    resourceName: resource.name,
    legIndex: null,
    quantityPosition: null,
    startsAt: occurrence.occurrenceStart,
    endsAt: new Date(end.getTime() + (gap?.minutes ?? 0) * 60_000),
    gapMinutes: gap?.minutes ?? null,
    gapSource: gap?.source ?? null,
    selectionMode: held.selectionMode,
    isBundleMember: held.isBundleMember,
  };
}
