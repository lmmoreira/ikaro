import { BookedSlot } from '../../domain/booked-slot';

export const BOOKING_AVAILABILITY_PORT = Symbol('IBookingAvailabilityPort');

export interface IBookingAvailabilityPort {
  lockTenantDay(tenantId: string, date: string): Promise<void>;
  findApprovedByTenantAndDate(tenantId: string, date: string): Promise<BookedSlot[]>;
  findApprovedByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<BookedSlot[]>;
}
