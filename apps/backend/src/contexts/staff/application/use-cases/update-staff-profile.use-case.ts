import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { LastActiveManagerError, StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { StaffRole } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface UpdateStaffProfileUseCaseInput {
  staffId: string;
  tenantId: string;
  name: string;
  role: StaffRole;
}

export interface UpdateStaffProfileUseCaseResult {
  staffId: string;
  name: string;
  role: StaffRole;
}

@Injectable()
export class UpdateStaffProfileUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(dto: UpdateStaffProfileUseCaseInput): Promise<UpdateStaffProfileUseCaseResult> {
    const staff = await this.staffRepo.findById(dto.staffId, dto.tenantId);
    if (!staff) throw new StaffNotFoundError(dto.staffId);

    // Count check and save are inside the same transaction to prevent concurrent
    // demotions from bypassing the last-manager guard — same pattern as deactivate.
    await this.txManager.run(async () => {
      if (staff.role === 'MANAGER' && dto.role === 'STAFF' && staff.isActive) {
        const activeManagers = await this.staffRepo.countActiveManagersByTenant(dto.tenantId);
        if (activeManagers <= 1) throw new LastActiveManagerError();
      }
      staff.updateProfile(dto.name, dto.role);
      await this.staffRepo.save(staff);
    });

    return { staffId: staff.id, name: staff.name!, role: staff.role };
  }
}
