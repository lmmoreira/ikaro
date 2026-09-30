import { Booking } from '../../domain/booking.aggregate';
import { RescheduleDurationChange } from '../../domain/booking.types';
import { Service } from '../../domain/service.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IBookingQuoteRevisionRepository } from '../ports/booking-quote-revision-repository.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ResourceSelectionInput } from './resource-occupancy.helpers';
import { moveBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  QuoteRevisionResult,
  recordQuoteRevisionIfPriceChanged,
  ResolveRescheduleCandidatesParams,
  resolveRescheduleCandidates,
} from './reschedule-quote.helpers';

export interface RescheduleBookingInTransactionDeps {
  bookingRepo: IBookingRepository;
  resourceRepo: IResourceRepository;
  occupancyRepo: IResourceOccupancyRepository;
  quoteRevisionRepo: IBookingQuoteRevisionRepository;
  availabilityService: AvailabilityService;
  slotConflictService: BookingSlotConflictService;
}

export interface RescheduleBookingInTransactionParams {
  booking: Booking;
  serviceMap: Map<string, Service>;
  newScheduledAt: Date;
  durationChange: RescheduleDurationChange | undefined;
  overrideSelections: ResourceSelectionInput[];
  adminNotes?: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
}

// The staff reschedule's own write sequence (UC-069 A3), shared by RescheduleBookingUseCase and by
// the future-commitment worklist's RESCHEDULE resolution (M23-S08) so the exception update and the
// booking change can commit in one transaction. Must be called from inside the caller's own
// txManager.run() — it saves the booking and rewrites the occupancy rows, and never opens a
// transaction of its own (a nested run() would start a second, independent one).
//
// The booking is always APPROVED here (Booking.reschedule()'s own guard), so its existing
// occupancy row(s) are COMMITTED, never HOLD.
export async function rescheduleBookingInTransaction(
  deps: RescheduleBookingInTransactionDeps,
  params: RescheduleBookingInTransactionParams,
): Promise<QuoteRevisionResult | undefined> {
  const { booking, tenantId, staffId } = params;
  const previousTotalPrice = booking.totalPrice;

  const candidatesByLine = await resolveRescheduleCandidates(toResolveParams(deps, params));

  booking.reschedule(
    staffId,
    params.newScheduledAt,
    params.correlationId,
    true,
    params.adminNotes,
    params.durationChange,
  );
  await deps.bookingRepo.save(booking);

  await moveBookingLinesOccupancy(
    deps.occupancyRepo,
    candidatesByLine,
    tenantId,
    'COMMITTED',
    null,
  );
  return recordQuoteRevisionIfPriceChanged(
    deps.quoteRevisionRepo,
    tenantId,
    booking.id,
    previousTotalPrice,
    booking.totalPrice,
    'STAFF',
    staffId,
  );
}

function toResolveParams(
  deps: RescheduleBookingInTransactionDeps,
  params: RescheduleBookingInTransactionParams,
): ResolveRescheduleCandidatesParams {
  return {
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    slotConflictService: deps.slotConflictService,
    booking: params.booking,
    serviceMap: params.serviceMap,
    tenantId: params.tenantId,
    newScheduledAt: params.newScheduledAt,
    timezone: params.timezone,
    overrideSelections: params.overrideSelections,
    durationChange: params.durationChange,
  };
}
