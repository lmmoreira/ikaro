import { localDateRangeBoundsUTC } from '../../shared/utils/calendar-date';
import { ResourceOccupiedSlot } from '../../contexts/booking/domain/resource-occupied-slot';
import { IBookingAvailabilityPort } from '../../contexts/booking/application/ports/booking-availability.port';

export class InMemoryBookingAvailabilityPort implements IBookingAvailabilityPort {
  private readonly slots: ResourceOccupiedSlot[] = [];

  setSlots(slots: ResourceOccupiedSlot[]): void {
    this.slots.length = 0;
    this.slots.push(...slots);
  }

  // Mirrors typeorm-booking-availability.adapter.ts's own UTC-instant-bounded window, derived
  // from the tenant-local calendar range — a unit test seeding occupancy just outside the
  // requested [from, to] range must see it correctly excluded, same as production.
  async findOccupancyByTenantAndResource(
    _tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
    timezone: string,
  ): Promise<ResourceOccupiedSlot[]> {
    const bounds = localDateRangeBoundsUTC(from, to, timezone);
    return this.slots.filter(
      (s) =>
        resourceIds.includes(s.resourceId) && s.startsAt < bounds.end && s.endsAt > bounds.start,
    );
  }
}
