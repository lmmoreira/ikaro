import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ScheduleOpeningNotFoundError,
  TenantOpeningHasResourceDependentsError,
} from '../../domain/errors/booking-domain.error';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';

export type RemoveScheduleOpeningUseCaseInput = {
  id: string;
  tenantId: string;
};

@Injectable()
export class RemoveScheduleOpeningUseCase {
  constructor(
    @Inject(SCHEDULE_OPENING_REPOSITORY)
    private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(TENANT_LOCK_PORT)
    private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RemoveScheduleOpeningUseCaseInput): Promise<void> {
    const { id, tenantId } = input;
    const opening = await this.openingRepo.findById(id, tenantId);
    if (!opening) throw new ScheduleOpeningNotFoundError(id);

    await this.txManager.run(async () => {
      // A resource-scoped opening on a date the tenant is normally closed can only exist
      // because this tenant-wide opening let it be created in the first place (see
      // OpenScheduleUseCase's tenant-window prerequisite) — removing it first would leave those
      // resource openings outside any window the tenant has open (docs/13-DATABASE_SCHEMA.md §
      // schedule_openings Rules). Block the removal instead; the resource-scoped openings must
      // be removed first. The lock is the same (tenantId, date) key OpenScheduleUseCase takes
      // before its own dependent-check, so a concurrent create can't slip a new dependent in
      // between this check and the delete below (Codex PR #460 round-4 finding).
      if (opening.resourceId === null) {
        await this.tenantLock.lockTenantDay(tenantId, opening.date);
        const hasDependents = await this.openingRepo.existsResourceScopedForDate(
          tenantId,
          opening.date,
        );
        if (hasDependents) {
          throw new TenantOpeningHasResourceDependentsError(opening.date);
        }
      }
      await this.openingRepo.delete(input.id, tenantId);
    });
  }
}
