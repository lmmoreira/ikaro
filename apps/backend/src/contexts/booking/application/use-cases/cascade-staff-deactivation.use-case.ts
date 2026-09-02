import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

export interface CascadeStaffDeactivationUseCaseInput {
  tenantId: string;
  staffId: string;
  eventId: string;
  correlationId: string;
}

export interface CascadeStaffDeactivationUseCaseResult {
  cascaded: boolean;
}

/**
 * UC-048: the Booking context's own reaction to `StaffDeactivated`, applying UC-047's exact
 * effect (deactivate) to whichever `Resource` wraps the deactivated staff member, if any.
 * No-ops when no such Resource exists (A1) — nothing to cascade.
 */
@Injectable()
export class CascadeStaffDeactivationUseCase {
  static readonly CONSUMER_NAME = 'cascade-staff-deactivation';

  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(INBOX_REPOSITORY) private readonly inboxRepo: IInboxRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CascadeStaffDeactivationUseCaseInput,
  ): Promise<CascadeStaffDeactivationUseCaseResult> {
    if (await this.isAlreadyProcessed(input.eventId)) return { cascaded: false };

    const resource = await this.resourceRepo.findByRefId(input.staffId, input.tenantId);
    if (!resource) {
      await this.markProcessed(input.eventId);
      return { cascaded: false };
    }

    resource.deactivate();

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
      await this.inboxRepo.markProcessed(
        input.eventId,
        CascadeStaffDeactivationUseCase.CONSUMER_NAME,
      );
    });

    return { cascaded: true };
  }

  private isAlreadyProcessed(eventId: string): Promise<boolean> {
    return this.inboxRepo.hasBeenProcessed(eventId, CascadeStaffDeactivationUseCase.CONSUMER_NAME);
  }

  private async markProcessed(eventId: string): Promise<void> {
    await this.txManager.run(async () => {
      await this.inboxRepo.markProcessed(eventId, CascadeStaffDeactivationUseCase.CONSUMER_NAME);
    });
  }
}
