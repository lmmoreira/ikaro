import { BookingServiceResourceTypeUnavailableError } from '../../domain/errors/booking-domain.error';
import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleIneligibleServiceError,
  RecurringScheduleOccurrenceConflict,
} from '../../domain/errors/recurring-booking-schedule.error';
import { RequestRecurringBookingScheduleResourceAssignmentInput } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurrenceOccurrence, RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { ServiceBookingPolicyProps } from '../../domain/service.types';
import {
  IResourceOccupancyRepository,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { IScheduleClosureRepository } from '../ports/schedule-closure-repository.port';
import { IScheduleOpeningRepository } from '../ports/schedule-opening-repository.port';
import { ITenantLockPort } from '../ports/tenant-lock.port';
import {
  findHoursConflicts,
  loadHoursScheduleData,
} from './recurring-booking-schedule-hours.helpers';
import {
  resolveEligibleResources,
  resolveRequirementResources,
} from './resource-requirement-resolution.helpers';
import { ResolutionContext } from './resource-resolution-context.helpers';

// Platform default hold when Service.bookingPolicy.manualHoldMinutes is null — matches
// booking-request.helpers.ts's own DEFAULT_MANUAL_HOLD_MINUTES (docs/02-DOMAIN_MODEL.md); kept as
// a small local constant rather than importing that file's private value, since the two hold
// concepts (a one-off booking's hold vs a recurring schedule's approval hold) are independent
// business rules that happen to share MVP's default.
const DEFAULT_MANUAL_HOLD_MINUTES = 30;

export function resolveApprovalStatus(policy: ServiceBookingPolicyProps): {
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: Date | null;
} {
  const status: 'ACTIVE' | 'PENDING_APPROVAL' =
    policy.defaultApprovalMode === 'AUTO_CONFIRM' ? 'ACTIVE' : 'PENDING_APPROVAL';
  const approvalHoldExpiresAt =
    status === 'PENDING_APPROVAL'
      ? new Date(Date.now() + (policy.manualHoldMinutes ?? DEFAULT_MANUAL_HOLD_MINUTES) * 60_000)
      : null;
  return { status, approvalHoldExpiresAt };
}

// Eligibility rules locked in during M23-S04 story-discovery (2026-09-27): single-resource
// services only (no bundle/leg recurrence), and the requirement's own selectionMode must match
// the requested assignmentPolicy (CUSTOMER_CHOICE ↔ FIXED_ASSIGNMENT, AUTO_ANY/AUTO_FUNGIBLE_POOL
// ↔ RESOLVE_PER_OCCURRENCE).
export function assertServiceEligible(
  service: Service,
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE',
): void {
  if (service.bookingModel !== 'APPOINTMENT') {
    throw new RecurringBookingScheduleIneligibleServiceError('not-appointment');
  }
  if (!service.bookingPolicy.recurrenceEligible) {
    throw new RecurringBookingScheduleIneligibleServiceError('recurrence-not-enabled');
  }
  if (service.legs !== null || service.resourceRequirements.length !== 1) {
    throw new RecurringBookingScheduleIneligibleServiceError('legged-or-bundled');
  }
  const requirement = service.resourceRequirements[0];
  if (requirement.requiredQuantity !== 1) {
    throw new RecurringBookingScheduleIneligibleServiceError('legged-or-bundled');
  }
  const expectedModes =
    assignmentPolicy === 'FIXED_ASSIGNMENT'
      ? ['CUSTOMER_CHOICE']
      : ['AUTO_ANY', 'AUTO_FUNGIBLE_POOL'];
  if (!expectedModes.includes(requirement.selectionMode)) {
    throw new RecurringBookingScheduleIneligibleServiceError('selection-mode-mismatch');
  }
}

export function buildResourceAssignments(
  service: Service,
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE',
  resourceIds: string[],
): RequestRecurringBookingScheduleResourceAssignmentInput[] {
  if (assignmentPolicy !== 'FIXED_ASSIGNMENT') return [];
  const requirement = service.resourceRequirements[0];
  return resourceIds.map((resourceId) => ({
    resourceId,
    resourceType: requirement.type,
    requirementId: null,
    requiredQuantityPosition: null,
  }));
}

export interface ConflictCheckDeps {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  occupancyRepo: IResourceOccupancyRepository;
  closureRepo: IScheduleClosureRepository;
  openingRepo: IScheduleOpeningRepository;
  tenantLock: ITenantLockPort;
}

export interface ConflictCheckParams {
  tenantId: string;
  timezone: string;
  businessHours: BusinessHours;
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  resourceIds: string[];
  recurrence: RecurrenceRule;
  service: Service;
  startsOn: string;
  endsOn: string;
  occurrences: RecurrenceOccurrence[];
}

// Checks every occurrence of the term, atomically, before either status branch commits (UC-070
// A1), in a number of queries independent of the occurrence count: resolve the resources once,
// lock them once, then (1) working hours and closures — the same rule availability applies — and
// (2) resource occupancy via a single overlap query, deciding per occurrence in memory. Both
// always run, and every affected occurrence is reported with its reason in one refusal, so the
// customer can fix the pattern in one round. Accepts and rejects exactly what resolving and
// checking each occurrence on its own (resolveBookingLinesResourceCandidates + assertSlotFree
// + isWindowFree) would.
export async function assertPatternConflictFree(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
): Promise<void> {
  if (params.occurrences.length === 0) return;
  const requirement = params.service.resourceRequirements[0];
  const resources = await resolveConsideredResources(deps, params, requirement);
  await deps.tenantLock.lockResources(
    params.tenantId,
    resources.map((resource) => resource.id),
  );
  const anyFreeResourceSuffices = requirement.selectionMode === 'AUTO_ANY';
  const hoursConflicts = await findHoursRefusals(deps, params, resources, anyFreeResourceSuffices);
  const occupiedConflicts = await findOccupiedRefusals(
    deps,
    params,
    resources,
    anyFreeResourceSuffices,
  );
  const conflicts = mergeConflicts(hoursConflicts, occupiedConflicts);
  if (conflicts.length > 0) throw new RecurringBookingScheduleConflictError(conflicts);
}

async function findHoursRefusals(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  resources: Resource[],
  anyOpenResourceSuffices: boolean,
): Promise<RecurringScheduleOccurrenceConflict[]> {
  const schedule = await loadHoursScheduleData(
    deps,
    params.tenantId,
    resources.map((resource) => resource.id),
    params.startsOn,
    params.endsOn,
  );
  return findHoursConflicts({
    availabilityService: deps.availabilityService,
    businessHours: params.businessHours,
    schedule,
    resources,
    anyOpenResourceSuffices,
    occurrences: params.occurrences,
    durationMinutes: params.recurrence.durationMinutes,
    bufferAfterMinutes: params.service.bufferAfterMinutes ?? 0,
  });
}

async function findOccupiedRefusals(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  resources: Resource[],
  anyFreeResourceSuffices: boolean,
): Promise<RecurringScheduleOccurrenceConflict[]> {
  const windows = buildOccurrenceWindows(deps.availabilityService, params, resources);
  const conflicting = await deps.occupancyRepo.findConflictingWindows(params.tenantId, windows);
  return blockedOccurrenceStarts(
    conflicting,
    params.occurrences,
    resources,
    anyFreeResourceSuffices,
  ).map((occurrenceStart) => ({ occurrenceStart, reason: 'OCCUPIED' as const }));
}

// One entry per occurrence, ordered by occurrenceStart; when an occurrence is refused for hours
// AND occupancy, the hours reason wins (a closed or out-of-hours slot can never be honored, no
// matter who else holds it).
function mergeConflicts(
  hoursConflicts: RecurringScheduleOccurrenceConflict[],
  occupiedConflicts: RecurringScheduleOccurrenceConflict[],
): RecurringScheduleOccurrenceConflict[] {
  const byStart = new Map<number, RecurringScheduleOccurrenceConflict>();
  for (const conflict of [...occupiedConflicts, ...hoursConflicts]) {
    byStart.set(conflict.occurrenceStart.getTime(), conflict);
  }
  return [...byStart.values()].sort(
    (a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime(),
  );
}

// The resources whose availability decides an occurrence. FIXED_ASSIGNMENT: the caller's pick,
// validated by the same rules a one-off booking applies. AUTO_ANY: every eligible resource, since
// any free one satisfies the occurrence. AUTO_FUNGIBLE_POOL: only the first eligible one, because
// resolveRequirementResources assigns that one without looking at availability.
async function resolveConsideredResources(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  requirement: ResourceRequirement,
): Promise<Resource[]> {
  const ctx: ResolutionContext = {
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    tenantId: params.tenantId,
    timezone: params.timezone,
    resourceCache: new Map(),
    activeResourcesByType: new Map(),
    excludeBookingLineIds: [],
  };
  if (params.assignmentPolicy === 'FIXED_ASSIGNMENT') {
    return resolveRequirementResources(
      requirement,
      ctx,
      params.resourceIds,
      params.occurrences[0].occurrenceStart,
      null,
    );
  }
  const eligible = await resolveEligibleResources(requirement, ctx);
  if (eligible.length === 0) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return requirement.selectionMode === 'AUTO_ANY' ? eligible : eligible.slice(0, 1);
}

function buildOccurrenceWindows(
  availabilityService: AvailabilityService,
  params: ConflictCheckParams,
  resources: Resource[],
): ResourceOccupancyWindow[] {
  const durationMs = params.recurrence.durationMinutes * 60_000;
  const bufferAfterMinutes = params.service.bufferAfterMinutes ?? 0;
  return params.occurrences.flatMap(({ occurrenceStart }) =>
    resources.map((resource) => {
      const gapMinutes = availabilityService.effectiveFlatGapMinutes(
        bufferAfterMinutes,
        resource.turnoverMinutes,
      );
      return {
        resourceId: resource.id,
        startsAt: occurrenceStart,
        endsAt: new Date(occurrenceStart.getTime() + durationMs + gapMinutes * 60_000),
      };
    }),
  );
}

// An occurrence is blocked when a resource it needs is busy: a single conflicting window suffices,
// except when one free resource is enough — then only when every considered resource is busy in
// that occurrence.
function blockedOccurrenceStarts(
  conflicting: ResourceOccupancyWindow[],
  occurrences: { occurrenceStart: Date }[],
  resources: Resource[],
  anyFreeResourceSuffices: boolean,
): Date[] {
  const busyByStart = new Map<number, Set<string>>();
  for (const { resourceId, startsAt } of conflicting) {
    const key = startsAt.getTime();
    busyByStart.set(key, (busyByStart.get(key) ?? new Set<string>()).add(resourceId));
  }
  return occurrences
    .filter(({ occurrenceStart }) => {
      const busy = busyByStart.get(occurrenceStart.getTime());
      if (!busy) return false;
      return anyFreeResourceSuffices ? resources.every((resource) => busy.has(resource.id)) : true;
    })
    .map(({ occurrenceStart }) => occurrenceStart);
}
