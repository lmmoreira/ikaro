import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyCandidate,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { isDegenerateService } from './availability-resource-scope.helpers';
import {
  resolveFlatLineCandidates,
  resolveLeggedLineCandidates,
} from './resource-occupancy-candidate-builders.helpers';
import { ResolutionContext, selectionKey } from './resource-resolution-context.helpers';

// isDegenerate carries isDegenerateService()'s verdict through to assignment time — see
// resource-occupancy-assignment.helpers.ts's effectiveLockState() for why.
export interface ResolvedLineCandidates {
  candidates: ResourceOccupancyCandidate[];
  isDegenerate: boolean;
}

export interface BookingLineForResolution {
  lineId: string;
  serviceId: string;
  durationMinsAtBooking: number;
}

// One customer-chosen resource for one CUSTOMER_CHOICE requirement (M23-S01). legIndex is null
// for a flat (non-legged) requirement, matching ResourceOccupancyCandidate's own shape.
// resourceType disambiguates within a bundle (more than one requirement on the same line/leg).
// AUTO_ANY/AUTO_FUNGIBLE_POOL/NONE requirements never consult these — a selection entry for one
// of those is simply ignored, never an error, so approve-booking/reschedule-booking's "replay
// every existing assignment regardless of its original selectionMode" re-resolution stays safe.
export interface ResourceSelectionInput {
  serviceId: string;
  legIndex: number | null;
  resourceType: ResourceType;
  resourceId: string;
}

function buildSelectionsByKey(selections: ResourceSelectionInput[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const selection of selections) {
    const key = selectionKey(selection.serviceId, selection.legIndex, selection.resourceType);
    const existing = map.get(key);
    if (existing) existing.push(selection.resourceId);
    else map.set(key, [selection.resourceId]);
  }
  return map;
}

// Bundled to stay under SonarCloud's max-parameters threshold (S107) —
// same shape every caller already builds from its own constructor-injected fields (mirrors
// PersistRequestedBookingDeps/Params in booking-request.helpers.ts).
export interface ResolveBookingLinesResourceCandidatesParams {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  occupancyRepo: IResourceOccupancyRepository;
  tenantId: string;
  scheduledAt: Date;
  timezone: string;
  lines: BookingLineForResolution[];
  serviceMap: Map<string, Service>;
  resourceSelections?: ResourceSelectionInput[];
}

// Resolves every booking line's service resourceRequirements/legs into concrete
// ResourceOccupancyCandidate rows (docs/13-DATABASE_SCHEMA.md § booking_line_resource_assignments
// / resource_occupancy), one per (line, leg?, requirement, quantity unit).
//
// selectionMode-aware since M23-S01 (UC-061/062/063) — the actual per-requirement algorithm lives
// in resource-requirement-resolution.helpers.ts's resolveRequirementResources(); this function is
// just the per-line orchestrator.
//
// Multiple lines are sequential and back-to-back within the booking's own combined window,
// matching today's Booking.totalDurationMins model (byte-identical for the degenerate case) — the
// UC-059 buffer/turnover gap is applied once, at the very end of the LAST line only, never
// between two lines of the same booking.
export async function resolveBookingLinesResourceCandidates(
  params: ResolveBookingLinesResourceCandidatesParams,
): Promise<Map<string, ResolvedLineCandidates>> {
  const { resourceRepo, availabilityService, occupancyRepo, tenantId, scheduledAt, timezone } =
    params;
  const { lines, serviceMap, resourceSelections = [] } = params;
  const ctx: ResolutionContext = {
    resourceRepo,
    availabilityService,
    occupancyRepo,
    tenantId,
    timezone,
    resourceCache: new Map(),
    // These lines' own pre-existing occupancy (if any — empty at creation, real at
    // approve/reschedule re-resolution) must never count as AUTO_ANY workload against itself.
    excludeBookingLineIds: lines.map((line) => line.lineId),
  };
  const selectionsByKey = buildSelectionsByKey(resourceSelections);
  const result = new Map<string, ResolvedLineCandidates>();
  let cursor = scheduledAt;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const service = serviceMap.get(line.serviceId);
    if (!service) throw new BookingServiceNotInTenantError(line.serviceId);
    const lineEnd = new Date(cursor.getTime() + line.durationMinsAtBooking * 60_000);

    const candidates = await resolveOneLineCandidates(
      service,
      ctx,
      cursor,
      lineEnd,
      i === lines.length - 1,
      selectionsByKey,
    );

    result.set(line.lineId, { candidates, isDegenerate: isDegenerateService(service) });
    cursor = lineEnd;
  }

  return result;
}

async function resolveOneLineCandidates(
  service: Service,
  ctx: ResolutionContext,
  lineStart: Date,
  lineEnd: Date,
  isLastLine: boolean,
  selectionsByKey: Map<string, string[]>,
): Promise<ResourceOccupancyCandidate[]> {
  return service.legs
    ? resolveLeggedLineCandidates(service, ctx, lineStart, selectionsByKey)
    : resolveFlatLineCandidates(service, ctx, lineStart, lineEnd, isLastLine, selectionsByKey);
}

// Replays a booking's already-persisted resource choice(s) into resourceSelections shape, for
// approve-booking/reschedule-booking's "re-resolve fresh every time" design (story-discovery,
// M23-S01) — there's no HTTP request to re-derive a CUSTOMER_CHOICE pick from at approval/
// reschedule time, so the immutable booking_line_resource_assignments record is the only source
// of truth for "which resource the customer actually picked." Every assignment is replayed
// regardless of its own requirement's selectionMode — an entry that doesn't match a
// CUSTOMER_CHOICE requirement is simply unused by resolveCandidateIds, never an error.
export async function deriveResourceSelectionsFromAssignments(
  occupancyRepo: IResourceOccupancyRepository,
  tenantId: string,
  bookingLineIds: string[],
  lineIdToServiceId: Map<string, string>,
): Promise<ResourceSelectionInput[]> {
  const assignments = await occupancyRepo.findAssignmentsByBookingLines(tenantId, bookingLineIds);
  return assignments.map((assignment) => ({
    serviceId: lineIdToServiceId.get(assignment.bookingLineId)!,
    legIndex: assignment.legIndex,
    resourceType: assignment.resourceType,
    resourceId: assignment.resourceId,
  }));
}
