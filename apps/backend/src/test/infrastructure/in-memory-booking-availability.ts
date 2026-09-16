import { ResourceOccupiedSlot } from '../../contexts/booking/domain/resource-occupied-slot';
import { IBookingAvailabilityPort } from '../../contexts/booking/application/ports/booking-availability.port';

export class InMemoryBookingAvailabilityPort implements IBookingAvailabilityPort {
  private readonly slots: ResourceOccupiedSlot[] = [];

  setSlots(slots: ResourceOccupiedSlot[]): void {
    this.slots.length = 0;
    this.slots.push(...slots);
  }

  async findOccupancyByTenantAndResource(
    _tenantId: string,
    resourceIds: string[],
    _from: string,
    _to: string,
  ): Promise<ResourceOccupiedSlot[]> {
    return this.slots.filter((s) => resourceIds.includes(s.resourceId));
  }
}
