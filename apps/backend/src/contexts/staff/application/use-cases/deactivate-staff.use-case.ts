import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  LastActiveManagerError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
} from '../../domain/errors/staff-domain.error';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface DeactivateStaffUseCaseInput {
  staffId: string;
  tenantId: string;
  deactivatedBy: string;
  correlationId: string;
}

export interface DeactivateStaffUseCaseResult {
  staffId: string;
  isActive: false;
}

@Injectable()
export class DeactivateStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(dto: DeactivateStaffUseCaseInput): Promise<DeactivateStaffUseCaseResult> {
    const staff = await this.staffRepo.findById(dto.staffId, dto.tenantId);
    if (!staff) throw new StaffNotFoundError(dto.staffId);

    // Fast exit — no DB query needed for self-deactivation
    if (staff.id === dto.deactivatedBy) throw new StaffSelfDeactivationError();

    // Count check and save are inside the same transaction to prevent
    // concurrent deactivations from bypassing the last-manager guard.
    await this.txManager.run(async () => {
      if (staff.role === 'MANAGER' && staff.isActive) {
        const activeManagers = await this.staffRepo.countActiveManagersByTenant(dto.tenantId);
        if (activeManagers <= 1) throw new LastActiveManagerError();
      }
      staff.deactivate(dto.deactivatedBy, dto.correlationId);
      await this.staffRepo.save(staff);
    });

    return { staffId: staff.id, isActive: false };
  }
}
