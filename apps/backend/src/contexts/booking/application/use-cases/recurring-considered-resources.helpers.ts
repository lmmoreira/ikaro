import { BookingServiceResourceTypeUnavailableError } from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IResourceRepository } from '../ports/resource-repository.port';
import { ITenantLockPort } from '../ports/tenant-lock.port';
import {
  effectiveRequirements,
  pickCustomerChoices,
  RecurringResourceSelection,
} from './recurring-service-requirement.helpers';
import {
  resolveEligibleResources,
  resolveRequirementResources,
} from './resource-requirement-resolution.helpers';
import { ResolutionContext } from './resource-resolution-context.helpers';

// The resources whose availability decides an occurrence, for one requirement of the service.
export interface ConsideredRequirement {
  requirement: ResourceRequirement;
  resources: Resource[];
  // true when one free, open resource satisfies the requirement (every mode but CUSTOMER_CHOICE);
  // false when the single picked resource must be.
  anyFreeResourceSuffices: boolean;
}

export interface ConsiderDeps {
  resourceRepo: IResourceRepository;
  availabilityService: AvailabilityService;
  occupancyRepo: IResourceOccupancyRepository;
}

export interface ConsiderParams {
  tenantId: string;
  timezone: string;
  service: Service;
  // The caller's picks, one per CUSTOMER_CHOICE requirement (approval replays the stored ones).
  selections: RecurringResourceSelection[];
  firstOccurrenceStart: Date;
}

// Per requirement of the service, in its own order. CUSTOMER_CHOICE: the caller's pick, validated by
// the same rules a one-off booking applies. AUTO_ANY, AUTO_FUNGIBLE_POOL and NONE: every eligible
// resource, since any free one satisfies the occurrence (resolveRequirementResources narrows a pool
// to its free units, exactly as it does for AUTO_ANY).
export async function resolveConsideredRequirements(
  deps: ConsiderDeps,
  params: ConsiderParams,
): Promise<ConsideredRequirement[]> {
  const requirements = effectiveRequirements(params.service);
  const picks = pickCustomerChoices(requirements, params.selections);
  const ctx: ResolutionContext = {
    ...deps,
    tenantId: params.tenantId,
    timezone: params.timezone,
    resourceCache: new Map(),
    activeResourcesByType: new Map(),
    excludeBookingLineIds: [],
  };
  const considered: ConsideredRequirement[] = [];
  // Strictly one requirement after another: they share the resolution context's resource cache.
  for (const requirement of requirements) {
    const pick = picks.find((candidate) => candidate.requirement === requirement);
    const resources = pick
      ? await resolveRequirementResources(
          requirement,
          ctx,
          [pick.resourceId],
          params.firstOccurrenceStart,
          null,
        )
      : await resolveAutomaticResources(requirement, ctx);
    considered.push({ requirement, resources, anyFreeResourceSuffices: pick === undefined });
  }
  return considered;
}

async function resolveAutomaticResources(
  requirement: ResourceRequirement,
  ctx: ResolutionContext,
): Promise<Resource[]> {
  const eligible = await resolveEligibleResources(requirement, ctx);
  if (eligible.length === 0) {
    throw new BookingServiceResourceTypeUnavailableError(requirement.type);
  }
  return eligible;
}

// Every considered resource of every requirement, locked in one call (the port orders them), so a
// concurrent one-off booking or schedule that needs any of them waits — the ordering a lock only
// provides to callers who also take it (docs/ENGINEERING_RULES_BACKEND.md § A lock only orders
// callers).
export async function lockConsideredResources(
  tenantLock: ITenantLockPort,
  tenantId: string,
  considered: ConsideredRequirement[],
): Promise<void> {
  const ids = new Set(considered.flatMap(({ resources }) => resources.map(({ id }) => id)));
  await tenantLock.lockResources(tenantId, [...ids]);
}

// The two steps every caller takes together, ahead of the cap check and the conflict check.
export async function resolveAndLockConsidered(
  deps: ConsiderDeps & { tenantLock: ITenantLockPort },
  params: ConsiderParams,
): Promise<ConsideredRequirement[]> {
  const considered = await resolveConsideredRequirements(deps, params);
  await lockConsideredResources(deps.tenantLock, params.tenantId, considered);
  return considered;
}
