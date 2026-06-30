import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ScheduleClosureNotFoundError } from '../../domain/errors/booking-domain.error';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';

export type RemoveClosureInput = {
  id: string;
  tenantId: string;
};

@Injectable()
export class RemoveClosureUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RemoveClosureInput): Promise<void> {
    const { id, tenantId } = input;
    const closure = await this.closureRepo.findById(id, tenantId);
    if (!closure) throw new ScheduleClosureNotFoundError(id);

    await this.txManager.run(async () => {
      await this.closureRepo.delete(input.id, tenantId);
    });
  }
}
