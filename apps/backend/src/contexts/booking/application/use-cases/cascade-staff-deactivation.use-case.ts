import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../shared/ports/inbox.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';

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
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  async execute(
    input: CascadeStaffDeactivationUseCaseInput,
  ): Promise<CascadeStaffDeactivationUseCaseResult> {
    // A separate, already-correct concern, unrelated to the staff-wrap race below — an early
    // return before the transaction opens is fine here.
    if (await this.isAlreadyProcessed(input.eventId)) return { cascaded: false };

    return this.txManager.run(async () => {
      // Serializes against CreateResourceUseCase/UpdateResourceUseCase's own lockTenantStaff
      // acquisition for the same (tenantId, staffId): whichever side wins the lock fully
      // determines what the other sees once it proceeds (M21-S06). The lookup below must happen
      // after acquiring the lock — not just before save() — so a concurrent create/update that's
      // still mid-flight when this cascade wins the lock is correctly seen once it commits and
      // releases, and vice versa.
      await this.tenantLock.lockTenantStaff(input.tenantId, input.staffId);

      const resource = await this.resourceRepo.findByRefId(input.staffId, input.tenantId);
      if (!resource) {
        await this.inboxRepo.markProcessed(
          input.eventId,
          CascadeStaffDeactivationUseCase.CONSUMER_NAME,
        );
        return { cascaded: false };
      }

      resource.deactivate();
      await this.resourceRepo.save(resource);
      await this.inboxRepo.markProcessed(
        input.eventId,
        CascadeStaffDeactivationUseCase.CONSUMER_NAME,
      );

      return { cascaded: true };
    });
  }

  private isAlreadyProcessed(eventId: string): Promise<boolean> {
    return this.inboxRepo.hasBeenProcessed(eventId, CascadeStaffDeactivationUseCase.CONSUMER_NAME);
  }
}
