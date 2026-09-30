import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import { BookingDomainError } from '../../domain/errors/booking-domain-error.base';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import {
  FutureCommitmentExceptionAlreadyResolvedError,
  FutureCommitmentExceptionNotFoundError,
} from '../../domain/errors/future-commitment-exception.error';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { FutureCommitmentExceptionResolutionType } from '../../domain/future-commitment-exception.types';
import { Service } from '../../domain/service.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  BOOKING_QUOTE_REVISION_REPOSITORY,
  IBookingQuoteRevisionRepository,
} from '../ports/booking-quote-revision-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import {
  IRecurringBookingScheduleRepository,
  RECURRING_BOOKING_SCHEDULE_REPOSITORY,
} from '../ports/recurring-booking-schedule-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  ReassignedOccurrence,
  syncRecurringScheduleAssignments,
} from './future-commitment-schedule-sync.helpers';
import { rescheduleBookingInTransaction } from './reschedule-booking-in-transaction.helpers';
import { ReassignTarget, reassignBookingResource } from './resource-reassignment.helpers';
import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';
import { mapSequentially } from '../../../../shared/utils/sequential';

export interface ResolveFutureCommitmentExceptionsUseCaseInput {
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
  exceptionIds: string[];
  resolutionType: FutureCommitmentExceptionResolutionType;
  reason?: string;
  // REASSIGN only.
  target?: ReassignTarget;
  // RESCHEDULE only — the request schema guarantees exactly one exceptionId alongside it.
  scheduledAt?: string;
}

export interface FutureCommitmentExceptionResolutionOutcome {
  exceptionId: string;
  outcome: 'RESOLVED' | 'STILL_OPEN';
  errorCode?: string;
}

export interface ResolveFutureCommitmentExceptionsUseCaseResult {
  results: FutureCommitmentExceptionResolutionOutcome[];
}

// UC-077. Best-effort per entry: each one runs in its OWN transaction, so an alternative that became
// unavailable (or a booking that changed meanwhile) leaves that entry OPEN and reports why, while
// the rest of the batch is still resolved. The booking change a choice implies and the entry's own
// resolution commit together.
@Injectable()
export class ResolveFutureCommitmentExceptionsUseCase {
  private readonly logger = new AppLogger(ResolveFutureCommitmentExceptionsUseCase.name);

  constructor(
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(BOOKING_QUOTE_REVISION_REPOSITORY)
    private readonly quoteRevisionRepo: IBookingQuoteRevisionRepository,
    @Inject(RECURRING_BOOKING_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IRecurringBookingScheduleRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
  ) {}

  async execute(
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
  ): Promise<ResolveFutureCommitmentExceptionsUseCaseResult> {
    const reassigned: ReassignedOccurrence[] = [];

    // Strictly one entry at a time: each is its own transaction, and concurrent ones would contend
    // for the same booking and resource locks (and for pool connections).
    const results = await mapSequentially(input.exceptionIds, (exceptionId) =>
      this.resolveOne(input, exceptionId, reassigned),
    );

    if (reassigned.length > 0) {
      await syncRecurringScheduleAssignments(
        {
          txManager: this.txManager,
          scheduleRepo: this.scheduleRepo,
          bookingRepo: this.bookingRepo,
          occupancyRepo: this.occupancyRepo,
          logger: this.logger,
        },
        input.tenantId,
        reassigned,
      );
    }
    return { results };
  }

  private async resolveOne(
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
    exceptionId: string,
    reassigned: ReassignedOccurrence[],
  ): Promise<FutureCommitmentExceptionResolutionOutcome> {
    const { tenantId, staffId, correlationId, resolutionType } = input;
    try {
      await this.txManager.run(async () => {
        const exception = await this.lockOpenEntry(exceptionId, tenantId);
        const booking = await this.loadBookingFor(exception, resolutionType, tenantId);

        if (resolutionType === 'CANCEL') {
          booking!.cancel(staffId, true, correlationId, input.reason);
          await this.bookingRepo.save(booking!);
          await releaseBookingOccupancy(
            this.occupancyRepo,
            tenantId,
            booking!.lines.map((l) => l.lineId),
          );
        } else if (resolutionType === 'REASSIGN') {
          const moved = await this.reassign(input, exception, booking!);
          if (moved) reassigned.push(moved);
        } else if (resolutionType === 'RESCHEDULE') {
          await this.reschedule(input, booking!);
        }

        exception.resolve(staffId, resolutionType, input.reason ?? null, correlationId);
        await this.exceptionRepo.save(exception);
      });
      return { exceptionId, outcome: 'RESOLVED' };
    } catch (err) {
      if (err instanceof BookingDomainError) {
        return { exceptionId, outcome: 'STILL_OPEN', errorCode: err.code };
      }
      throw err;
    }
  }

  // The row lock serializes two managers acting on the same entry: the second one waits, then sees
  // it already resolved.
  private async lockOpenEntry(
    exceptionId: string,
    tenantId: string,
  ): Promise<FutureCommitmentException> {
    const exception = await this.exceptionRepo.findByIdForUpdate(exceptionId, tenantId);
    if (!exception) throw new FutureCommitmentExceptionNotFoundError(exceptionId);
    if (exception.status !== 'OPEN') {
      throw new FutureCommitmentExceptionAlreadyResolvedError(exceptionId);
    }
    return exception;
  }

  // KEEP never touches the booking; every other choice reads it fresh, after the row lock.
  private async loadBookingFor(
    exception: FutureCommitmentException,
    resolutionType: FutureCommitmentExceptionResolutionType,
    tenantId: string,
  ): Promise<Booking | null> {
    if (resolutionType === 'KEEP') return null;
    const booking = await this.bookingRepo.findById(exception.affectedId, tenantId);
    if (!booking) throw new BookingNotFoundError(exception.affectedId);
    return booking;
  }

  private async reassign(
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
    exception: FutureCommitmentException,
    booking: Booking,
  ): Promise<ReassignedOccurrence | null> {
    const { targetResourceId } = await reassignBookingResource(
      {
        resourceRepo: this.resourceRepo,
        occupancyRepo: this.occupancyRepo,
        tenantLock: this.tenantLock,
      },
      {
        tenantId: input.tenantId,
        booking,
        serviceMap: await this.loadServiceMap(booking, input.tenantId),
        sourceResourceId: exception.sourceId,
        target: input.target ?? { mode: 'AUTO' },
        timezone: input.timezone,
      },
    );
    if (!booking.recurringScheduleId) return null;
    return {
      recurringScheduleId: booking.recurringScheduleId,
      fromResourceId: exception.sourceId,
      toResourceId: targetResourceId,
    };
  }

  // Booking.reschedule() refuses anything but an APPROVED booking (InvalidBookingTransition), which
  // surfaces as a per-entry STILL_OPEN with its own error code.
  private async reschedule(
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
    booking: Booking,
  ): Promise<void> {
    const newScheduledAt = new Date(input.scheduledAt!);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    await rescheduleBookingInTransaction(
      {
        bookingRepo: this.bookingRepo,
        resourceRepo: this.resourceRepo,
        occupancyRepo: this.occupancyRepo,
        quoteRevisionRepo: this.quoteRevisionRepo,
        availabilityService: this.availabilityService,
        slotConflictService: this.slotConflictService,
      },
      {
        booking,
        serviceMap: await this.loadServiceMap(booking, input.tenantId),
        newScheduledAt,
        durationChange: undefined,
        overrideSelections: [],
        tenantId: input.tenantId,
        staffId: input.staffId,
        correlationId: input.correlationId,
        timezone: input.timezone,
      },
    );
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }
}
