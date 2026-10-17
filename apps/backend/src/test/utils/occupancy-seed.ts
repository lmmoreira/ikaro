import { IResourceOccupancyRepository } from '../../contexts/booking/application/ports/resource-occupancy-repository.port';
import { ResourceType } from '../../contexts/booking/domain/resource.types';
import { ResourceOccupancyLockState } from '../../contexts/booking/domain/resource-occupancy-lock-state';

export const SEEDED_OCCUPANCY_RESOURCE_ID = 'eeeeeeee-0000-4000-8000-000000000001';

// A one-hour LOCATION occupancy row for a booking line, in the given lock state — the minimum a
// spec needs to give a booking a HOLD (or COMMITTED) row without going through the request flow.
export async function seedOccupancy(
  occupancyRepo: IResourceOccupancyRepository,
  params: {
    tenantId: string;
    bookingLineId: string;
    lockState: ResourceOccupancyLockState;
    holdExpiresAt: Date | null;
    startsAt?: Date;
    resourceId?: string;
  },
): Promise<void> {
  const startsAt = params.startsAt ?? new Date(Date.now() + 2 * 86_400_000);
  await occupancyRepo.assign(
    params.tenantId,
    params.bookingLineId,
    [
      {
        resourceId: params.resourceId ?? SEEDED_OCCUPANCY_RESOURCE_ID,
        resourceType: ResourceType.LOCATION,
        resourceName: 'Main location',
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
      },
    ],
    params.lockState,
    params.holdExpiresAt,
  );
}
