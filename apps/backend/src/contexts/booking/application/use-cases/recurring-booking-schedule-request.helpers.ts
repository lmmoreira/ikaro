import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingBundlePartiallyUnavailableError,
  BookingLegUnavailableError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleIneligibleServiceError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { RequestRecurringBookingScheduleResourceAssignmentInput } from '../../domain/recurring-booking-schedule.aggregate';
import { RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { ServiceBookingPolicyProps } from '../../domain/service.types';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  resolveBookingLinesResourceCandidates,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';

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
  slotConflictService: BookingSlotConflictService;
}

export interface ConflictCheckParams {
  tenantId: string;
  serviceId: string;
  timezone: string;
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  resourceIds: string[];
  recurrence: RecurrenceRule;
  service: Service;
  occurrences: { occurrenceStart: Date }[];
}

// Resource-conflict-checks every implied occurrence within the horizon, atomically, before either
// status branch commits (UC-070 A1) — reuses M23-S01's exact per-occurrence resolution
// (resolveBookingLinesResourceCandidates) and conflict check (assertSlotFree), the same building
// blocks a one-off booking uses, just replayed once per occurrence with a synthetic line.
export async function assertPatternConflictFree(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
): Promise<void> {
  const requirement = params.service.resourceRequirements[0];
  const resourceSelections: ResourceSelectionInput[] =
    params.assignmentPolicy === 'FIXED_ASSIGNMENT'
      ? params.resourceIds.map((resourceId) => ({
          serviceId: params.serviceId,
          legIndex: null,
          resourceType: requirement.type,
          resourceId,
        }))
      : [];

  try {
    for (const occurrence of params.occurrences) {
      await assertOccurrenceFree(deps, params, occurrence.occurrenceStart, resourceSelections);
    }
  } catch (err) {
    if (
      err instanceof BookingSlotUnavailableError ||
      err instanceof BookingLegUnavailableError ||
      err instanceof BookingBundlePartiallyUnavailableError
    ) {
      throw new RecurringBookingScheduleConflictError();
    }
    throw err;
  }
}

async function assertOccurrenceFree(
  deps: ConflictCheckDeps,
  params: ConflictCheckParams,
  occurrenceStart: Date,
  resourceSelections: ResourceSelectionInput[],
): Promise<void> {
  const lineId = uuidv7();
  const resolved = await resolveBookingLinesResourceCandidates({
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    tenantId: params.tenantId,
    scheduledAt: occurrenceStart,
    timezone: params.timezone,
    lines: [
      {
        lineId,
        serviceId: params.serviceId,
        durationMinsAtBooking: params.recurrence.durationMinutes,
      },
    ],
    serviceMap: new Map([[params.serviceId, params.service]]),
    resourceSelections,
  });
  const { candidates } = resolved.get(lineId)!;
  await deps.slotConflictService.assertSlotFree(params.tenantId, candidates);
}
