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
// journey"; a conflict touching a true bundle member (isBundleMember, stamped per the story's own
// definition — resourceRequirements.length >= 2 on that candidate's own line, not just "more than
// one flat candidate somewhere in the booking") is "part of this booking"; everything else keeps
// the original single-resource message. An ordinary multi-service basket (two independent
// single-resource services) correctly falls through to the generic message, since neither
// service is itself a bundle — inferring "bundle" from flat-candidate-count alone would
// conflate the two.
function throwSlotConflictError(
  candidates: ResourceOccupancyCandidate[],
  conflictingResourceIds: string[],
): never {
  const conflicting = candidates.filter((c) => conflictingResourceIds.includes(c.resourceId));
  if (conflicting.some((c) => c.legIndex !== null)) throw new BookingLegUnavailableError();
  if (conflicting.some((c) => c.isBundleMember)) throw new BookingBundlePartiallyUnavailableError();
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
