import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { ScheduleClosureNotFoundError } from '../../domain/errors/booking-domain.error';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';

@Injectable()
export class RemoveClosureUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(id: string): Promise<void> {
    const tenantId = this.tenantContext.tenantId;
    const closure = await this.closureRepo.findById(id, tenantId);
    if (!closure) throw new ScheduleClosureNotFoundError(id);

    await this.txManager.run(async () => {
      await this.closureRepo.delete(id, tenantId);
    });
  }
}
