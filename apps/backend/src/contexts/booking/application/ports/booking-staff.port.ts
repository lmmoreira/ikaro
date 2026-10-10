export const BOOKING_STAFF_PORT = Symbol('IBookingStaffPort');

export interface BookingStaffProfileDto {
  id: string;
  isActive: boolean;
}

export interface IBookingStaffPort {
  findActiveById(staffId: string, tenantId: string): Promise<BookingStaffProfileDto | null>;

  // One batched, tenant-scoped read of display names (M23-S27, the booking-detail status history).
  // Every requested id is a key of the result; an unknown id, one from another tenant, or a staff
  // member with no name maps to null. Deactivated staff keep their name — the history is a record.
  findNamesByIds(
    staffIds: readonly string[],
    tenantId: string,
  ): Promise<Map<string, string | null>>;
}
