import { Inject, Injectable } from '@nestjs/common';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Staff } from '../../domain/staff.aggregate';
import { IStaffRepository, STAFF_REPOSITORY } from '../ports/staff-repository.port';

export interface CreateInitialManagerDto {
  tenantId: string;
  eventId: string;
  adminEmail: string;
  correlationId: string;
}

export interface CreateInitialManagerUseCaseResult {
  staffId: string;
}

@Injectable()
export class CreateInitialManagerUseCase {
  static readonly CONSUMER_NAME = 'create-initial-manager';

  constructor(
    @Inject(STAFF_REPOSITORY) private readonly staffRepo: IStaffRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  // TD24-S04: closes the one consumer with no TenantProvisioned dedup coverage. The
  // findByTenantAndEmail lookup already made this use case naturally idempotent by business key;
  // the inbox check adds the same eventId-based guarantee every other consumer has, and catches
  // the (should-be-impossible, since both writes commit in the same transaction) case where an
  // event was marked processed but the staff row can't be found.
  async execute(dto: CreateInitialManagerDto): Promise<CreateInitialManagerUseCaseResult> {
    const { tenantId, eventId, adminEmail, correlationId } = dto;

    const existing = await this.staffRepo.findByTenantAndEmail(tenantId, adminEmail);
    if (existing) return { staffId: existing.id };

    const alreadyProcessed = await this.inboxRepo.hasBeenProcessed(
      eventId,
      CreateInitialManagerUseCase.CONSUMER_NAME,
    );
    if (alreadyProcessed) {
      throw new Error(
        `TenantProvisioned ${eventId} already marked processed but no staff found for tenant ${tenantId} — data inconsistency`,
      );
    }

    const staff = Staff.inviteFromProvisioning(tenantId, adminEmail, correlationId);

    await this.txManager.run(async () => {
      await this.staffRepo.save(staff);
      await this.inboxRepo.markProcessed(eventId, CreateInitialManagerUseCase.CONSUMER_NAME);
    });

    return { staffId: staff.id };
  }
}
