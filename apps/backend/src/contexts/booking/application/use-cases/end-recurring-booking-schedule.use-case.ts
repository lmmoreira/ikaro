import { Inject, Injectable } from '@nestjs/common';
import type { ActorRole } from '@ikaro/types/protocol/actor';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RecurringBookingScheduleNotFoundError } from '../../domain/errors/recurring-booking-schedule.error';
import { RecurringBookingScheduleActorType } from '../../domain/recurring-booking-schedule.aggregate';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import {
  saveTerminalBookingsInTransaction,
  TerminalBookingDeps,
} from '../helpers/booking-exception-closing.helpers';
import { assertScheduleOwnership } from './recurring-booking-schedule-ownership.helpers';

export interface EndRecurringBookingScheduleUseCaseInput {
  scheduleId: string;
  tenantId: string;
  correlationId: string;
  actorId: string;
  actorRole: ActorRole;
}

export interface EndRecurringBookingScheduleUseCaseResult {
  id: string;
  status: 'CANCELLED';
  cancelledBookingIds: string[];
}

// UC-070 A2 (end) — cancels every future, still-active occurrence already materialized by this
// schedule and releases their resource_occupancy rows. Each occurrence is cancelled with
// cancelledByScheduleEnd = true so it sends no cancellation email of its own: the schedule's
// single RecurringBookingScheduleEnded email replaces them (M23-S28).
@Injectable()
export class EndRecurringBookingScheduleUseCase {
  constructor(
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  private get closingDeps(): TerminalBookingDeps {
    return {
      bookingRepo: this.bookingRepo,
      occupancyRepo: this.occupancyRepo,
      exceptionRepo: this.exceptionRepo,
      tenantLock: this.tenantLock,
    };
  }

  async execute(
    input: EndRecurringBookingScheduleUseCaseInput,
  ): Promise<EndRecurringBookingScheduleUseCaseResult> {
    const schedule = await this.scheduleRepo.findById(input.scheduleId, input.tenantId);
    if (!schedule) throw new RecurringBookingScheduleNotFoundError(input.scheduleId);
    const ownerType: RecurringBookingScheduleActorType =
      input.actorRole === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    assertScheduleOwnership(schedule, ownerType, input.actorId);

    const cancelledBookingIds = await this.txManager.run(async () => {
      const found = await this.bookingRepo.findFutureActiveByRecurringSchedule(
        input.tenantId,
        schedule.id,
        new Date(),
      );
      const futureBookings = [...found].sort((a, b) => a.id.localeCompare(b.id));

      for (const booking of futureBookings) {
        booking.cancel(
          { type: input.actorRole, id: input.actorId },
          input.correlationId,
          undefined,
          true,
        );
      }
      await saveTerminalBookingsInTransaction(this.closingDeps, {
        tenantId: input.tenantId,
        bookings: futureBookings,
        correlationId: input.correlationId,
      });

      schedule.end(
        input.correlationId,
        futureBookings.map((b) => b.id),
        ownerType,
      );
      await this.scheduleRepo.save(schedule);
      return futureBookings.map((b) => b.id);
    });

    return { id: schedule.id, status: 'CANCELLED', cancelledBookingIds };
  }
}
