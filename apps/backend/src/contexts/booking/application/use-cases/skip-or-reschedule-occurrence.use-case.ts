import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  RecurringBookingSchedule,
  RecurringBookingScheduleActorType,
} from '../../domain/recurring-booking-schedule.aggregate';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';

export interface SkipOrRescheduleOccurrenceUseCaseInput {
  scheduleId: string;
  tenantId: string;
  correlationId: string;
  occurrenceStart: Date;
  action: 'SKIP' | 'RESCHEDULE';
  replacementBookingId?: string;
  reason?: string;
  actorType: RecurringBookingScheduleActorType;
  actorId: string;
}

export interface SkipOrRescheduleOccurrenceUseCaseResult {
  scheduleId: string;
  occurrenceStart: string;
  kind: 'SKIPPED' | 'RESCHEDULED';
}

// UC-070 A2 — cancels the linked Booking for this occurrence if generation (M23-S05) has already
// materialized it; otherwise the exception alone is enough to keep the not-yet-generated occurrence
// from ever being created.
@Injectable()
export class SkipOrRescheduleOccurrenceUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: SkipOrRescheduleOccurrenceUseCaseInput,
  ): Promise<SkipOrRescheduleOccurrenceUseCaseResult> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);

    await this.applyException(schedule, input);

    // Both save() calls below must stay textually inside this callback —
    // architecture-check's transactional-save detector requires save() to be lexically nested in
    // the ITransactionManager.run() callback, not merely reachable through a helper method.
    await this.txManager.run(async () => {
      const linkedBooking = await this.bookingRepo.findByRecurringScheduleAndOccurrence(
        input.tenantId,
        schedule.id,
        input.occurrenceStart,
      );
      if (linkedBooking) {
        linkedBooking.cancel(
          input.actorId,
          input.actorType === 'STAFF',
          input.correlationId,
          input.reason,
        );
        await this.bookingRepo.save(linkedBooking);
        await releaseBookingOccupancy(
          this.occupancyRepo,
          input.tenantId,
          linkedBooking.lines.map((l) => l.lineId),
        );
      }
      await this.scheduleRepo.save(schedule);
    });

    return {
      scheduleId: schedule.id,
      occurrenceStart: input.occurrenceStart.toISOString(),
      kind: input.action === 'SKIP' ? 'SKIPPED' : 'RESCHEDULED',
    };
  }

  private async applyException(
    schedule: RecurringBookingSchedule,
    input: SkipOrRescheduleOccurrenceUseCaseInput,
  ): Promise<void> {
    if (input.action !== 'RESCHEDULE') {
      schedule.skipOccurrence(
        input.occurrenceStart,
        input.actorType,
        input.actorId,
        input.reason ?? null,
      );
      return;
    }

    const replacement = await this.bookingRepo.findById(
      input.replacementBookingId!,
      input.tenantId,
    );
    if (!replacement) throw new BookingNotFoundError(input.replacementBookingId!);
    schedule.rescheduleOccurrence(
      input.occurrenceStart,
      input.replacementBookingId!,
      input.actorType,
      input.actorId,
      input.reason ?? null,
    );
  }
}
