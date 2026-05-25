import { Inject, Injectable } from '@nestjs/common';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

@Injectable()
export class StaffQueryService {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async findManagersByTenant(tenantId: string): Promise<string[]> {
    const { items } = await this.staffRepo.findAllByTenant(tenantId, 1000, 0);
    // deactivatedBy === null means the staff member has not been removed (covers both
    // invited-not-yet-activated and active managers); excludes explicitly deactivated staff.
    return items
      .filter((s) => s.role === 'MANAGER' && s.deactivatedBy === null)
      .map((s) => s.email.address);
  }
}
