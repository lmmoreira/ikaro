import { Inject, Injectable } from '@nestjs/common';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface GetStaffByOAuthIdUseCaseResult {
  staffId: string;
  tenantId: string;
  role: StaffRole;
  isActive: boolean;
}

@Injectable()
export class GetStaffByOAuthIdUseCase {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async execute(googleOAuthId: string): Promise<GetStaffByOAuthIdUseCaseResult[]> {
    const staffList = await this.staffRepo.findAllByGoogleOAuthId(googleOAuthId);
    return staffList.map((staff) => ({
      staffId: staff.id,
      tenantId: staff.tenantId,
      role: staff.role,
      isActive: staff.isActive,
    }));
  }
}
