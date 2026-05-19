import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { StaffDeactivated } from '../../domain/events/staff-deactivated.event';
import {
  LastActiveManagerError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
} from '../../domain/errors/staff-domain.error';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface DeactivateStaffUseCaseResult {
  staffId: string;
  isActive: false;
}

@Injectable()
export class DeactivateStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(
    id: string,
    tenantId: string,
    deactivatedBy: string,
  ): Promise<DeactivateStaffUseCaseResult> {
    const staff = await this.staffRepo.findById(id, tenantId);
    if (!staff) throw new StaffNotFoundError(id);

    // Early-exit before the DB query — aggregate enforces the same invariant in deactivate()
    if (staff.id === deactivatedBy) throw new StaffSelfDeactivationError();

    if (staff.role === 'MANAGER' && staff.isActive) {
      const activeManagers = await this.staffRepo.countActiveManagersByTenant(tenantId);
      if (activeManagers <= 1) throw new LastActiveManagerError();
    }

    staff.deactivate(deactivatedBy);

    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
    });

    await this.eventBus.publish(new StaffDeactivated(tenantId, uuidv7(), staff.id, deactivatedBy));

    return { staffId: staff.id, isActive: false };
  }
}
