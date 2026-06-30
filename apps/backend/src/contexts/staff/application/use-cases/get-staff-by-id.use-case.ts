import { Inject, Injectable } from '@nestjs/common';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface GetStaffByIdUseCaseInput {
  staffId: string;
  tenantId: string;
}

export interface GetStaffByIdUseCaseResult {
  id: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'STAFF';
  isActive: boolean;
  createdAt: string;
}

@Injectable()
export class GetStaffByIdUseCase {
  constructor(@Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository) {}

  async execute(input: GetStaffByIdUseCaseInput): Promise<GetStaffByIdUseCaseResult> {
    const { staffId, tenantId } = input;
    const staff = await this.staffRepo.findById(staffId, tenantId);
    if (!staff) throw new StaffNotFoundError(staffId);

    return {
      id: staff.id,
      email: staff.email.address,
      name: staff.name,
      role: staff.role,
      isActive: staff.isActive,
      createdAt: staff.createdAt.toISOString(),
    };
  }
}
