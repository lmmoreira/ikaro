import { Inject, Injectable } from '@nestjs/common';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
  ResourceOccupancyWindow,
} from '../ports/resource-occupancy-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';

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
    candidates: ResourceOccupancyWindow[],
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
    if (conflicting.length > 0) throw new BookingSlotUnavailableError();
  }
}
