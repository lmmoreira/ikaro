import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';

export interface ExpireRecurringScheduleApprovalsJobResult {
  expired: number;
  ended: number;
}

// UC-070 A5 and the natural end of a term, in one pass over the tenants. Each schedule changes in
// its own transaction, so one failure never blocks the rest; a failure is logged and the next
// 30-minute run retries it. Every query is tenant-scoped (the (tenant_id, status, ...) indexes
// serve them) and "today" is each tenant's own calendar date, not the server's.
@Injectable()
export class ExpireRecurringBookingScheduleApprovalsJob {
  private readonly logger = new AppLogger(ExpireRecurringBookingScheduleApprovalsJob.name);

  constructor(
    @Inject(BOOKING_PLATFORM_PORT) private readonly tenantPort: IBookingPlatformPort,
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(now: Date = new Date()): Promise<ExpireRecurringScheduleApprovalsJobResult> {
    const tenants = await this.tenantPort.findAllActive();
    const perTenant = await Promise.all(tenants.map((tenant) => this.processTenant(tenant, now)));
    return {
      expired: perTenant.reduce((sum, result) => sum + result.expired, 0),
      ended: perTenant.reduce((sum, result) => sum + result.ended, 0),
    };
  }

  private async processTenant(
    tenant: { id: string; timezone: string },
    now: Date,
  ): Promise<ExpireRecurringScheduleApprovalsJobResult> {
    const correlationId = uuidv7();
    const pending = await this.scheduleRepo.findPendingApprovalExpired(tenant.id, now);
    const expired = await this.applyAll(pending, (schedule) => schedule.expire(correlationId));
    const localToday = utcDateToLocalDate(now, tenant.timezone);
    const finished = await this.scheduleRepo.findActiveEndedBefore(tenant.id, localToday);
    const ended = await this.applyAll(finished, (schedule) => schedule.markEnded());
    return { expired, ended };
  }

  // The count of schedules actually changed. Each one changes in its own transaction (its own
  // connection), so they are independent and run side by side.
  private async applyAll(
    schedules: RecurringBookingSchedule[],
    change: (schedule: RecurringBookingSchedule) => void,
  ): Promise<number> {
    const outcomes = await Promise.all(
      schedules.map((schedule) => this.applyOne(schedule, change)),
    );
    return outcomes.filter(Boolean).length;
  }

  // A version conflict means a staff decision (or a parallel run) got there first, which is the
  // outcome the job wanted anyway; any other failure is logged and retried on the next run.
  private async applyOne(
    schedule: RecurringBookingSchedule,
    change: (schedule: RecurringBookingSchedule) => void,
  ): Promise<boolean> {
    try {
      change(schedule);
      await this.txManager.run(() => this.scheduleRepo.save(schedule));
      return true;
    } catch (err) {
      if (err instanceof BookingConcurrentModificationError) return false;
      this.logger.error(
        'Failed to update a recurring schedule — will retry on the next run',
        err instanceof Error ? err.stack : String(err),
        { tenantId: schedule.tenantId, recurringScheduleId: schedule.id },
      );
      return false;
    }
  }
}
