import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';

export interface PauseRecurringBookingScheduleUseCaseInput {
  scheduleId: string;
  tenantId: string;
  correlationId: string;
}

export interface PauseRecurringBookingScheduleUseCaseResult {
  id: string;
  status: 'PAUSED';
}

@Injectable()
export class PauseRecurringBookingScheduleUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: PauseRecurringBookingScheduleUseCaseInput,
  ): Promise<PauseRecurringBookingScheduleUseCaseResult> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);

    schedule.pause(input.correlationId);

    await this.txManager.run(async () => {
      await this.scheduleRepo.save(schedule);
    });

    return { id: schedule.id, status: 'PAUSED' };
  }
}
