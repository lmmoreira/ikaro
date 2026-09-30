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

export interface RejectRecurringBookingScheduleUseCaseInput {
  scheduleId: string;
  tenantId: string;
  correlationId: string;
}

export interface RejectRecurringBookingScheduleUseCaseResult {
  id: string;
  status: 'CANCELLED';
}

// UC-071 (reject). No occurrence was ever materialized for a pending request, so there is nothing
// to release. The schedule's version check makes the loser of a reject/approve/expire race fail
// with a 409 instead of overwriting the winner.
@Injectable()
export class RejectRecurringBookingScheduleUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: RejectRecurringBookingScheduleUseCaseInput,
  ): Promise<RejectRecurringBookingScheduleUseCaseResult> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);

    schedule.reject(input.correlationId);
    await this.txManager.run(() => this.scheduleRepo.save(schedule));

    return { id: schedule.id, status: 'CANCELLED' };
  }
}
