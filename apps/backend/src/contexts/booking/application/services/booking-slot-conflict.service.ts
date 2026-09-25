import { Inject, Injectable } from '@nestjs/common';
import {
  BookingBundlePartiallyUnavailableError,
  BookingLegUnavailableError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
  ResourceOccupancyCandidate,
} from '../ports/resource-occupancy-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';

// UC-064 A2 / UC-065 A1 (M23-S01) — a conflict touching a legged candidate is "one part of this
// journey," a conflict touching more than one flat candidate across the booking is "part of this
// booking," and everything else keeps the original single-resource message. This is an
// approximation, not a strict "only a true single-service bundle counts" rule: a multi-service
// basket where two different single-resource services both contend counts as the bundle message
// too, since from the customer's point of view "part of what I'm booking isn't available anymore"
// is equally true either way, and getting the exact bundle-vs-basket distinction right would
// require threading per-line requirement-grouping through this call, not just the flattened
// candidate list it already receives.
function throwSlotConflictError(
  candidates: ResourceOccupancyCandidate[],
  conflictingResourceIds: string[],
): never {
  const conflicting = candidates.filter((c) => conflictingResourceIds.includes(c.resourceId));
  if (conflicting.some((c) => c.legIndex !== null)) throw new BookingLegUnavailableError();
  const flatCandidateCount = candidates.filter((c) => c.legIndex === null).length;
  if (flatCandidateCount > 1) throw new BookingBundlePartiallyUnavailableError();
  throw new BookingSlotUnavailableError();
}

// Resource-scoped rewrite (M22-S03) — previously checked the whole tenant via
// IBookingAvailabilityPort.findApprovedByTenantAndDate() + ITenantLockPort.lockTenantDay().
// Callers now resolve concrete resourceId(s)/window(s) first (resource-occupancy.helpers.ts) and
// pass them here; this service only locks + checks, it no longer knows about services/dates.
@Injectable()
export class BookingSlotConflictService {
  constructor(
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TENANT_LOCK_PORT)
    private readonly tenantLock: ITenantLockPort,
  ) {}

  async assertSlotFree(
    tenantId: string,
    candidates: ResourceOccupancyCandidate[],
    excludeBookingLineIds?: string[],
  ): Promise<void> {
    if (candidates.length === 0) return;
    const resourceIds = candidates.map((c) => c.resourceId);
    await this.tenantLock.lockResources(tenantId, resourceIds);
    const conflicting = await this.occupancyRepo.findConflictingResourceIds(
      tenantId,
      candidates,
      excludeBookingLineIds,
    );
    if (conflicting.length > 0) throwSlotConflictError(candidates, conflicting);
  }
}
