import { Booking } from '../../domain/booking.aggregate';
import { BookingLineInput } from '../../domain/booking-line.entity';
import {
  BookingCustomerNotFoundError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { RecurrenceOccurrence } from '../../domain/recurrence-rule.helpers';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { CustomerProfileDto, IBookingCustomerPort } from '../ports/booking-customer.port';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { buildLineInputs } from './booking-request.mapper';
import { assignBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';

export interface MaterializeOccurrencesDeps {
  bookingRepo: IBookingRepository;
  customerPort: IBookingCustomerPort;
  resourceRepo: IResourceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  availabilityService: AvailabilityService;
}

export interface MaterializeOccurrencesParams {
  schedule: RecurringBookingSchedule;
  service: Service;
  occurrences: RecurrenceOccurrence[];
  timezone: string;
  // The approving staff member; null when the schedule auto-confirmed at creation.
  approvedByStaffId: string | null;
}

type ContactProfile = CustomerProfileDto & { phone: string };

// Everything an occurrence shares, resolved once before the loop.
interface OccurrenceTemplate {
  contact: ContactProfile;
  lineInputs: BookingLineInput[];
  serviceMap: Map<string, Service>;
  resourceSelections: ResourceSelectionInput[];
}

// UC-070 step 3 / UC-071 step 3 — creates one linked, directly-APPROVED booking per occurrence of
// the schedule's term and commits its resource occupancy, one occurrence at a time so a later
// AUTO_ANY/pool resolution already sees the load the earlier occurrences just wrote. A plain
// function called from inside the caller's ITransactionManager.run(): it must never open a
// transaction of its own, because run() always starts a new, independent one (it does not join the
// caller's), which would break "the status change and every occurrence commit together".
//
// The occurrences were already checked for hours, closures and occupancy under the same lock
// (assertPatternConflictFree), so nothing is re-checked here; the exclusion constraint on
// resource_occupancy stays the last safety net. Returns the created booking ids.
export async function materializeRecurringScheduleOccurrences(
  deps: MaterializeOccurrencesDeps,
  params: MaterializeOccurrencesParams,
): Promise<string[]> {
  const template = await buildTemplate(deps, params);
  const bookingIds: string[] = [];
  for (const { occurrenceStart } of params.occurrences) {
    bookingIds.push(await materializeOccurrence(deps, params, template, occurrenceStart));
  }
  return bookingIds;
}

async function buildTemplate(
  deps: MaterializeOccurrencesDeps,
  { schedule, service }: MaterializeOccurrencesParams,
): Promise<OccurrenceTemplate> {
  const customer = await deps.customerPort.findById(schedule.customerId, schedule.tenantId);
  if (!customer) throw new BookingCustomerNotFoundError(schedule.customerId);
  if (!customer.phone) throw new CustomerPhoneNotSetError();

  const serviceMap = new Map([[service.id, service]]);
  return {
    contact: { ...customer, phone: customer.phone },
    serviceMap,
    lineInputs: buildLineInputs([service.id], serviceMap, {
      serviceId: service.id,
      durationMinutes: schedule.recurrence.durationMinutes,
      priceAtBooking: service.price,
    }),
    // FIXED_ASSIGNMENT: the stored assignment rows are the customer's pick for every occurrence.
    // RESOLVE_PER_OCCURRENCE has no rows, so each occurrence is resolved on its own.
    resourceSelections: schedule.resourceAssignments.map((assignment) => ({
      serviceId: service.id,
      legIndex: null,
      resourceType: assignment.resourceType,
      resourceId: assignment.resourceId,
    })),
  };
}

async function materializeOccurrence(
  deps: MaterializeOccurrencesDeps,
  params: MaterializeOccurrencesParams,
  template: OccurrenceTemplate,
  occurrenceStart: Date,
): Promise<string> {
  const { schedule } = params;
  const { contact } = template;
  const booking = Booking.materializeRecurringOccurrence({
    tenantId: schedule.tenantId,
    customerId: schedule.customerId,
    contactEmail: contact.email,
    contactName: contact.name,
    contactPhone: contact.phone,
    scheduledAt: occurrenceStart,
    lineInputs: template.lineInputs,
    recurringScheduleId: schedule.id,
    approvedBy: params.approvedByStaffId,
    pickupAddress: contact.defaultAddress ?? undefined,
  });
  const candidatesByLine = await resolveOccurrenceCandidates(
    deps,
    params,
    template,
    booking,
    occurrenceStart,
  );
  await deps.bookingRepo.save(booking);
  await assignBookingLinesOccupancy(
    deps.occupancyRepo,
    candidatesByLine,
    schedule.tenantId,
    'COMMITTED',
    null,
  );
  return booking.id;
}

function resolveOccurrenceCandidates(
  deps: MaterializeOccurrencesDeps,
  params: MaterializeOccurrencesParams,
  template: OccurrenceTemplate,
  booking: Booking,
  occurrenceStart: Date,
): Promise<Map<string, ResolvedLineCandidates>> {
  return resolveBookingLinesResourceCandidates({
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    tenantId: params.schedule.tenantId,
    scheduledAt: occurrenceStart,
    timezone: params.timezone,
    lines: booking.lines.map((line) => ({
      lineId: line.lineId,
      serviceId: line.serviceId,
      durationMinsAtBooking: line.durationMinsAtBooking,
    })),
    serviceMap: template.serviceMap,
    resourceSelections: template.resourceSelections,
  });
}
