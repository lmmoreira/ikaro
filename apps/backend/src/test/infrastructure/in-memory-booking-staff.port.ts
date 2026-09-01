import {
  BookingStaffProfileDto,
  IBookingStaffPort,
} from '../../contexts/booking/application/ports/booking-staff.port';

export class InMemoryBookingStaffPort implements IBookingStaffPort {
  private readonly store = new Map<string, BookingStaffProfileDto>();

  setProfile(staffId: string, profile: BookingStaffProfileDto): void {
    this.store.set(staffId, profile);
  }

  async findActiveById(staffId: string, _tenantId: string): Promise<BookingStaffProfileDto | null> {
    const profile = this.store.get(staffId);
    if (!profile || !profile.isActive) return null;
    return profile;
  }
}
