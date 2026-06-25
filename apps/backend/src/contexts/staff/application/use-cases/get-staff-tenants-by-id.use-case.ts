import { Inject, Injectable } from '@nestjs/common';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface GetStaffTenantsByIdUseCaseResult {
  staffId: string;
  tenantId: string;
  role: StaffRole;
  isActive: boolean;
}

@Injectable()
export class GetStaffTenantsByIdUseCase {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async execute(staffId: string, tenantId: string): Promise<GetStaffTenantsByIdUseCaseResult[]> {
    const staff = await this.staffRepo.findById(staffId, tenantId);
    if (!staff) throw new StaffNotFoundError(staffId);

    const { googleOAuthId } = staff;
    if (!googleOAuthId) {
      return [
        { staffId: staff.id, tenantId: staff.tenantId, role: staff.role, isActive: staff.isActive },
      ];
    }

    const allStaff = await this.staffRepo.findAllByGoogleOAuthId(googleOAuthId);
    return allStaff.map((s) => ({
      staffId: s.id,
      tenantId: s.tenantId,
      role: s.role,
      isActive: s.isActive,
    }));
  }
}
