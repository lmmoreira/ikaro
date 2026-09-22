export const BOOKING_STAFF_PORT = Symbol('IBookingStaffPort');

export interface BookingStaffProfileDto {
  id: string;
  isActive: boolean;
}

export interface IBookingStaffPort {
  findActiveById(staffId: string, tenantId: string): Promise<BookingStaffProfileDto | null>;
}
