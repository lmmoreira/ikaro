import { Inject, Injectable } from '@nestjs/common';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface GetStaffByEmailUseCaseInput {
  email: string;
  tenantId: string;
}

export interface GetStaffByEmailUseCaseResult {
  staffId: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  googleOAuthId: string | null;
}

@Injectable()
export class GetStaffByEmailUseCase {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async execute(input: GetStaffByEmailUseCaseInput): Promise<GetStaffByEmailUseCaseResult> {
    const { email, tenantId } = input;
    const normalizedEmail = email.toLowerCase().trim();
    const staff = await this.staffRepo.findByTenantAndEmail(tenantId, normalizedEmail);
    if (!staff) throw new StaffNotFoundError(normalizedEmail);
    return {
      staffId: staff.id,
      email: staff.email.address,
      role: staff.role,
      isActive: staff.isActive,
      googleOAuthId: staff.googleOAuthId,
    };
  }
}
