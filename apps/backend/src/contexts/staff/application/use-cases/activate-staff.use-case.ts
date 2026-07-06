import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  StaffAlreadyActiveError,
  StaffNotFoundError,
  StaffSelfReactivationError,
} from '../../domain/errors/staff-domain.error';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface ActivateStaffUseCaseInput {
  staffId: string;
  tenantId: string;
  activatedBy: string;
  correlationId: string;
}

export interface ActivateStaffUseCaseResult {
  staffId: string;
  isActive: true;
}

@Injectable()
export class ActivateStaffUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: ActivateStaffUseCaseInput): Promise<ActivateStaffUseCaseResult> {
    const staff = await this.staffRepo.findById(dto.staffId, dto.tenantId);
    if (!staff) throw new StaffNotFoundError(dto.staffId);

    // Fast exit — no DB write needed for either check
    if (staff.id === dto.activatedBy) throw new StaffSelfReactivationError();
    if (staff.isActive) throw new StaffAlreadyActiveError(dto.staffId);

    await this.txManager.run(async () => {
      staff.activate(dto.activatedBy, dto.correlationId);
      await this.staffRepo.save(staff);
    });

    for (const event of staff.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return { staffId: staff.id, isActive: true };
  }
}
