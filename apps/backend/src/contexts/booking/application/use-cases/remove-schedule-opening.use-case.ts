import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { ScheduleOpeningNotFoundError } from '../../domain/errors/booking-domain.error';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';

@Injectable()
export class RemoveScheduleOpeningUseCase {
  constructor(
    @Inject(SCHEDULE_OPENING_REPOSITORY)
    private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(id: string): Promise<void> {
    const tenantId = this.tenantContext.tenantId;
    const opening = await this.openingRepo.findById(id, tenantId);
    if (!opening) throw new ScheduleOpeningNotFoundError(id);

    await this.txManager.run(async () => {
      await this.openingRepo.delete(id, tenantId);
    });
  }
}
