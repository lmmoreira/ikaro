import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleAlreadyClosedError } from '../../domain/errors/booking-domain.error';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import { CloseScheduleDto } from '../dtos/close-schedule.dto';

export type CloseScheduleInput = CloseScheduleDto & {
  tenantId: string;
  createdBy: string;
};

export interface CloseScheduleUseCaseResult {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

@Injectable()
export class CloseScheduleUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CloseScheduleInput): Promise<CloseScheduleUseCaseResult> {
    const { tenantId, createdBy } = input;

    const closure = ScheduleClosure.close(
      tenantId,
      input.date,
      input.reason,
      createdBy,
      input.startTime,
      input.endTime,
      input.notes,
    );

    const existing = await this.closureRepo.findByTenantAndDate(tenantId, input.date);
    if (existing.some((c) => c.overlaps(closure.startTime, closure.endTime))) {
      throw new ScheduleAlreadyClosedError(input.date);
    }

    await this.txManager.run(async () => {
      await this.closureRepo.save(closure);
    });

    return this.toResult(closure);
  }

  private toResult(closure: ScheduleClosure): CloseScheduleUseCaseResult {
    return {
      id: closure.id,
      date: closure.date,
      startTime: closure.startTime?.value ?? null,
      endTime: closure.endTime?.value ?? null,
      reason: closure.reason,
      notes: closure.notes,
      createdBy: closure.createdBy,
      createdAt: closure.createdAt.toISOString(),
    };
  }
}
