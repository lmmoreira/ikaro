import {
  BookingStaffProfileDto,
  IBookingStaffPort,
} from '../../contexts/booking/application/ports/booking-staff.port';

export class InMemoryBookingStaffPort implements IBookingStaffPort {
  private readonly store = new Map<string, BookingStaffProfileDto>();

  setProfile(staffId: string, profile: BookingStaffProfileDto): void {
    this.store.set(staffId, profile);
  }

  private readonly names = new Map<string, string | null>();

  setName(staffId: string, name: string | null): void {
    this.names.set(staffId, name);
  }

  findNamesByIds(
    staffIds: readonly string[],
    _tenantId: string,
  ): Promise<Map<string, string | null>> {
    return Promise.resolve(new Map(staffIds.map((id) => [id, this.names.get(id) ?? null])));
  }

  async findActiveById(staffId: string, _tenantId: string): Promise<BookingStaffProfileDto | null> {
    const profile = this.store.get(staffId);
    if (!profile?.isActive) return null;
    return profile;
  }
}
