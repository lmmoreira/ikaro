import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Booking } from '../../domain/booking.aggregate';
import { RescheduleDurationChange } from '../../domain/booking.types';
import { Service } from '../../domain/service.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IBookingQuoteRevisionRepository } from '../ports/booking-quote-revision-repository.port';
import { IFutureCommitmentExceptionRepository } from '../ports/future-commitment-exception-repository.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  dismissStaleExceptionsAfterMove,
  occupiedResourceIds,
} from '../helpers/booking-exception-closing.helpers';
import { HoursScheduleRepos } from './schedule-hours.helpers';
import { ResourceSelectionInput } from './resource-occupancy.types';
import { ResolutionSnapshot } from './resource-resolution-context.helpers';
import { moveBookingLinesOccupancy } from '../helpers/resource-occupancy-assignment.helpers';
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
  exceptionRepo: IFutureCommitmentExceptionRepository;
  // Closures and openings: the new time must be one the business is open for.
  hoursRepos: HoursScheduleRepos;
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
  businessHours: BusinessHours;
  // Entries the caller closes itself (the worklist's selected entry is RESOLVED by the manager).
  excludeExceptionIds?: readonly string[];
  // What the caller read when it took its resource locks (the worklist's reschedule).
  resolutionSnapshot?: ResolutionSnapshot;
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
  const { candidatesByLine, openExceptions } = await resolveAndLockExceptions(deps, params);

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
  await dismissStaleExceptionsAfterMove(deps, {
    tenantId,
    booking,
    exceptions: openExceptions,
    correlationId: params.correlationId,
    excludeExceptionIds: params.excludeExceptionIds,
  });
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

// Resource locks (the old resources included) first, then the booking's open entries (R4), both
// before the booking row is written (docs/LOCK_CATALOG.md § 2).
async function resolveAndLockExceptions(
  deps: RescheduleBookingInTransactionDeps,
  params: RescheduleBookingInTransactionParams,
) {
  const { booking, tenantId } = params;
  const occupiedBefore = await occupiedResourceIds(deps.occupancyRepo, tenantId, [booking]);
  const candidatesByLine = await resolveRescheduleCandidates({
    ...toResolveParams(deps, params),
    alsoLockResourceIds: [...occupiedBefore],
    resolutionSnapshot: params.resolutionSnapshot,
  });
  const openExceptions = await deps.exceptionRepo.findOpenByAffectedForUpdate(tenantId, 'BOOKING', [
    booking.id,
  ]);
  return { candidatesByLine, openExceptions };
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
    hoursSource: { repos: deps.hoursRepos, businessHours: params.businessHours },
  };
}
