import { localDateRangeBoundsUTC } from '../../shared/utils/calendar-date';
import { ResourceOccupiedSlot } from '../../contexts/booking/domain/resource-occupied-slot';
import { DayGridOccupancyBlock } from '../../contexts/booking/domain/day-grid-occupancy-block';
import { IBookingAvailabilityPort } from '../../contexts/booking/application/ports/booking-availability.port';

export class InMemoryBookingAvailabilityPort implements IBookingAvailabilityPort {
  private readonly slots: ResourceOccupiedSlot[] = [];
  private readonly dayGridBlocks: DayGridOccupancyBlock[] = [];

  setSlots(slots: ResourceOccupiedSlot[]): void {
    this.slots.length = 0;
    this.slots.push(...slots);
  }

  setDayGridBlocks(blocks: DayGridOccupancyBlock[]): void {
    this.dayGridBlocks.length = 0;
    this.dayGridBlocks.push(...blocks);
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

  async findDayGridOccupancy(
    _tenantId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
  ): Promise<DayGridOccupancyBlock[]> {
    const bounds = localDateRangeBoundsUTC(date, date, timezone);
    return this.dayGridBlocks.filter(
      (b) =>
        resourceIds.includes(b.resourceId) && b.startsAt < bounds.end && b.endsAt > bounds.start,
    );
  }
}
