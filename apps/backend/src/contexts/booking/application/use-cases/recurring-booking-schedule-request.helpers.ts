import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  RecurringBookingScheduleConflictError,
  RecurringScheduleOccurrenceConflict,
} from '../../domain/errors/recurring-booking-schedule.error';
import { RecurrenceOccurrence, RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import { Resource } from '../../domain/resource.aggregate';
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
  evaluateHours,
  HoursEvaluation,
  loadHoursScheduleData,
} from './recurring-booking-schedule-hours.helpers';
import { ConsideredRequirement } from './recurring-considered-resources.helpers';
import {
  findCombinedRefusals,
  findOccupiedRefusals,
} from './recurring-occurrence-occupancy.helpers';
import { planBundleOccurrences } from './recurring-occurrence-resource-plan.helpers';

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
  recurrence: RecurrenceRule;
  service: Service;
  startsOn: string;
  endsOn: string;
  occurrences: RecurrenceOccurrence[];
}

// Checks every occurrence of the term, atomically, before either status branch commits (UC-070
// A1), in a number of queries independent of the occurrence count and of the number of
// requirements: the caller has resolved and locked the considered resources once
// (recurring-considered-resources.helpers.ts), then this runs (1) working hours and closures — the
// same rule availability applies — and (2) resource occupancy via a single overlap query, deciding
// per occurrence and per requirement in memory. Both always run, and every affected occurrence is
// reported with its reason in one refusal, so the customer can fix the pattern in one round. An
// occurrence is refused when ANY requirement is unsatisfied. Accepts and rejects exactly what
// resolving and checking each occurrence on its own (resolveBookingLinesResourceCandidates +
// assertSlotFree + isWindowFree) would. Returns, per occurrence in order, the resource assigned to
// each requirement (the plan the materialization step persists).
export async function assertPatternConflictFree(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  considered: ConsideredRequirement[],
): Promise<Resource[][]> {
  if (params.occurrences.length === 0) return [];
  const { conflicts, unavailableWindows } = await collectConflicts(deps, params, considered);
  if (conflicts.length > 0) throw new RecurringBookingScheduleConflictError(conflicts);

  // The same pass that accepted the term also decides which resource each occurrence gets, so the
  // materialization that follows resolves nothing (recurring-occurrence-resource-plan.helpers.ts).
  return planBundleOccurrences(deps.occupancyRepo, {
    tenantId: params.tenantId,
    timezone: params.timezone,
    occurrences: params.occurrences,
    unavailableWindows,
    requirements: considered.map(({ requirement, resources }) => ({
      selectionMode: requirement.selectionMode,
      resources,
    })),
  });
}

// Hours and occupancy refusals merged into one list, plus every (resource, occurrence) pair that
// cannot be assigned.
async function collectConflicts(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  considered: ConsideredRequirement[],
): Promise<{
  conflicts: RecurringScheduleOccurrenceConflict[];
  unavailableWindows: ResourceOccupancyWindow[];
}> {
  const hours = await findHoursRefusals(deps, params, considered);
  const occupancy = await findOccupiedRefusals({
    occupancyRepo: deps.occupancyRepo,
    availabilityService: deps.availabilityService,
    tenantId: params.tenantId,
    occurrences: params.occurrences,
    durationMinutes: params.recurrence.durationMinutes,
    bufferAfterMinutes: params.service.bufferAfterMinutes ?? 0,
    groups: considered,
  });
  // Busy, closed or outside hours: none of these (resource, occurrence) pairs may be assigned.
  const unavailableWindows = [...occupancy.conflictingWindows, ...hours.unavailable];
  const conflicts = mergeConflicts(hours.conflicts, [
    ...occupancy.refusals,
    ...considered
      .filter((group) => group.anyFreeResourceSuffices)
      .flatMap((group) =>
        findCombinedRefusals({
          occurrences: params.occurrences,
          resources: group.resources,
          unavailable: unavailableWindows,
        }),
      ),
  ]);
  return { conflicts, unavailableWindows };
}

// One schedule load for every considered resource, then one pure pass per requirement: an
// occurrence is closed when any requirement cannot be served, and the first reason found names it.
async function findHoursRefusals(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  considered: ConsideredRequirement[],
): Promise<HoursEvaluation> {
  const resourceIds = [...new Set(considered.flatMap((group) => group.resources.map((r) => r.id)))];
  const schedule = await loadHoursScheduleData(
    deps,
    params.tenantId,
    resourceIds,
    params.startsOn,
    params.endsOn,
  );
  const evaluations = considered.map((group) =>
    evaluateHours({
      availabilityService: deps.availabilityService,
      businessHours: params.businessHours,
      schedule,
      resources: group.resources,
      anyOpenResourceSuffices: group.anyFreeResourceSuffices,
      occurrences: params.occurrences,
      durationMinutes: params.recurrence.durationMinutes,
      bufferAfterMinutes: params.service.bufferAfterMinutes ?? 0,
    }),
  );
  return {
    conflicts: evaluations.flatMap((evaluation) => evaluation.conflicts),
    unavailable: evaluations.flatMap((evaluation) => evaluation.unavailable),
  };
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
