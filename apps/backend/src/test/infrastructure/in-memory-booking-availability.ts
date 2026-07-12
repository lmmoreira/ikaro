import { BookedSlot } from '../../contexts/booking/domain/booked-slot';
import { IBookingAvailabilityPort } from '../../contexts/booking/application/ports/booking-availability.port';

export class InMemoryBookingAvailabilityPort implements IBookingAvailabilityPort {
  private readonly slots: BookedSlot[] = [];

  setSlots(slots: BookedSlot[]): void {
    this.slots.length = 0;
    this.slots.push(...slots);
  }

  async lockTenantDay(_tenantId: string, _date: string): Promise<void> {
    return undefined;
  }

  async findApprovedByTenantAndDate(_tenantId: string, _date: string): Promise<BookedSlot[]> {
    return [...this.slots];
  }

  async findApprovedByTenantAndDateRange(
    _tenantId: string,
    _from: string,
    _to: string,
  ): Promise<BookedSlot[]> {
    return [...this.slots];
  }
}
