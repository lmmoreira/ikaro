import { Booking } from '../../domain/booking.aggregate';
import {
  BookingQuoteRevision,
  BookingQuoteRevisionActorType,
} from '../../domain/booking-quote-revision';
import { RescheduleDurationChange } from '../../domain/booking.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { Money } from '../../../../shared/value-objects/money';
import { IBookingQuoteRevisionRepository } from '../ports/booking-quote-revision-repository.port';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyCandidate,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  deriveResourceSelectionsFromAssignments,
  mergeResourceSelections,
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';

// UC-069 — at most one line can be durationPolicy=CUSTOMER_SELECTED (UC-067 A4's own invariant,
// carried unchanged from booking creation), so a reschedule's optional durationMinutes always
// targets that one line. No matching line -> durationMinutes is silently ignored, same
// "unused, never an error" convention UC-068 A5 already established for a mismatched intake
// submission.
export function resolveRescheduleDurationChange(
  booking: Booking,
  serviceMap: Map<string, Service>,
  quoteService: BookingQuoteService,
  durationMinutes: number | undefined,
): RescheduleDurationChange | undefined {
  if (durationMinutes === undefined) return undefined;
  const line = booking.lines.find(
    (l) => serviceMap.get(l.serviceId)?.bookingPolicy.durationPolicy === 'CUSTOMER_SELECTED',
  );
  if (!line) return undefined;

  const service = serviceMap.get(line.serviceId)!;
  const quote = quoteService.quote(service, durationMinutes);
  return {
    lineId: line.lineId,
    durationMinutes: quote.durationMinutes,
    priceAtBooking: quote.priceAtBooking,
  };
}

// UC-069 precondition (customer path only) — Service.rescheduleWindowHoursOverride, null inherits
// the tenant cancellationWindowHours default (docs/02-DOMAIN_MODEL.md — no separate tenant-level
// reschedule default exists). A multi-line basket has no documented precedence rule for divergent
// per-service overrides; this resolves to the MAX override across the basket's lines (the most
// business-protective reading — a reschedule must clear every line's own notice requirement, not
// just the shortest one). Flagged for the user as an assumption, not a confirmed business rule.
export function resolveEffectiveRescheduleWindowHours(
  booking: Booking,
  serviceMap: Map<string, Service>,
  tenantDefaultHours: number,
): number {
  const overrides = booking.lines
    .map((l) => serviceMap.get(l.serviceId)?.bookingPolicy.rescheduleWindowHoursOverride)
    .filter((v): v is number => v != null);
  return overrides.length ? Math.max(...overrides) : tenantDefaultHours;
}

export interface QuoteRevisionResult {
  revisionNo: number;
  amount: { amount: string; currency: string };
}

// UC-069 step 3 — inserted only when the reschedule actually changed the price (a variable-
// duration re-quote, or a future leg-composition change); a same-price time-only reschedule
// records nothing. Must be called from inside the caller's own txManager.run() — the repository's
// save() is what architecture-check's transactional-save detector enforces stays there.
export async function recordQuoteRevisionIfPriceChanged(
  quoteRevisionRepo: IBookingQuoteRevisionRepository,
  tenantId: string,
  bookingId: string,
  previousTotalPrice: Money,
  newTotalPrice: Money,
  actorType: BookingQuoteRevisionActorType,
  actorId: string | null,
): Promise<QuoteRevisionResult | undefined> {
  if (newTotalPrice.equals(previousTotalPrice)) return undefined;

  const previousRevisionNo = await quoteRevisionRepo.findLatestRevisionNo(tenantId, bookingId);
  const revision = BookingQuoteRevision.record({
    tenantId,
    bookingId,
    previousRevisionNo,
    amount: newTotalPrice,
    reason: 'RESCHEDULE_DURATION_CHANGE',
    actorType,
    actorId,
  });
  await quoteRevisionRepo.save(revision);

  return {
    revisionNo: revision.revisionNo,
    amount: { amount: revision.amount.amount.toFixed(2), currency: revision.amount.currency },
  };
}

// Bundled to stay under SonarCloud's max-parameters threshold, same rationale as
// ResolveBookingLinesResourceCandidatesParams (resource-occupancy.helpers.ts).
export interface ResolveRescheduleCandidatesParams {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  occupancyRepo: IResourceOccupancyRepository;
  slotConflictService: BookingSlotConflictService;
  booking: Booking;
  serviceMap: Map<string, Service>;
  tenantId: string;
  newScheduledAt: Date;
  timezone: string;
  overrideSelections: ResourceSelectionInput[];
  durationChange: RescheduleDurationChange | undefined;
}

// Shared by RescheduleBookingUseCase (admin) and RescheduleBookingAsCustomerUseCase — resolves the
// NEW window's candidates and re-checks for conflicts, excluding this booking's own existing
// (soon-to-be-moved) occupancy row(s), same "a commitment never conflicts with itself" guarantee
// UC-060 A2 requires. A body-supplied resourceSelections entry overrides the default replay for
// its matching key (mergeResourceSelections); the affected line's duration reflects durationChange
// here even though Booking.reschedule() hasn't applied it to the aggregate yet (same transaction,
// applied further down by the caller), so the conflict check runs against the NEW duration.
export async function resolveRescheduleCandidates(
  params: ResolveRescheduleCandidatesParams,
): Promise<Map<string, ResolvedLineCandidates>> {
  const { resourceRepo, availabilityService, occupancyRepo, slotConflictService } = params;
  const { booking, serviceMap, tenantId, newScheduledAt, timezone, durationChange } = params;
  const bookingLineIds = booking.lines.map((l) => l.lineId);

  const resourceSelections = await resolveRescheduleResourceSelections(params);
  const candidatesByLine = await resolveBookingLinesResourceCandidates({
    resourceRepo,
    availabilityService,
    occupancyRepo,
    tenantId,
    scheduledAt: newScheduledAt,
    timezone,
    lines: rescheduleLineInputs(booking, durationChange),
    serviceMap,
    resourceSelections,
  });

  const allCandidates: ResourceOccupancyCandidate[] = [...candidatesByLine.values()].flatMap(
    (v) => v.candidates,
  );
  await slotConflictService.assertSlotFree(tenantId, allCandidates, bookingLineIds);
  return candidatesByLine;
}

function rescheduleLineInputs(
  booking: Booking,
  durationChange: RescheduleDurationChange | undefined,
) {
  return booking.lines.map((line) => ({
    lineId: line.lineId,
    serviceId: line.serviceId,
    durationMinsAtBooking:
      durationChange?.lineId === line.lineId
        ? durationChange.durationMinutes
        : line.durationMinsAtBooking,
  }));
}

async function resolveRescheduleResourceSelections(
  params: ResolveRescheduleCandidatesParams,
): Promise<ResourceSelectionInput[]> {
  const { occupancyRepo, booking, tenantId, overrideSelections } = params;
  const bookingLineIds = booking.lines.map((l) => l.lineId);
  const lineIdToServiceId = new Map(booking.lines.map((l) => [l.lineId, l.serviceId]));
  const replayedSelections = await deriveResourceSelectionsFromAssignments(
    occupancyRepo,
    tenantId,
    bookingLineIds,
    lineIdToServiceId,
  );
  return mergeResourceSelections(replayedSelections, overrideSelections);
}
