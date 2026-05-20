import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, IEventBus } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Staff } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface CreateInitialManagerDto {
  tenantId: string;
  adminEmail: string;
  correlationId: string;
}

export interface CreateInitialManagerUseCaseResult {
  staffId: string;
}

@Injectable()
export class CreateInitialManagerUseCase {
  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: CreateInitialManagerDto): Promise<CreateInitialManagerUseCaseResult> {
    const { tenantId, adminEmail, correlationId } = dto;

    const existing = await this.staffRepo.findByTenantAndEmail(tenantId, adminEmail);
    if (existing) return { staffId: existing.id };

    const staff = Staff.inviteFromProvisioning(tenantId, adminEmail, correlationId);

    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
    });

    for (const event of staff.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return { staffId: staff.id };
  }
}
