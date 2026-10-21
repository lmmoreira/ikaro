import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Booking } from '../../domain/booking.aggregate';
import { BookingDomainError } from '../../domain/errors/booking-domain-error.base';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import {
  FutureCommitmentExceptionAlreadyResolvedError,
  FutureCommitmentExceptionNotFoundError,
} from '../../domain/errors/future-commitment-exception.error';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { FutureCommitmentExceptionResolutionType } from '../../domain/future-commitment-exception.types';
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
import {
  lockRescheduleResourcesBeforeEntry,
  rescheduleThroughWorklist,
  WorklistRescheduleDeps,
} from './future-commitment-reschedule.helpers';
import { reassignThroughWorklist } from './future-commitment-reassign.helpers';
import { ResolutionSnapshot } from './resource-resolution-context.helpers';
import { ReassignTarget } from './resource-reassignment.helpers';
import { TerminalBookingDeps } from '../helpers/booking-exception-closing.helpers';
import { FutureCommitmentExceptionResolutionOutcome } from './future-commitment-exception-resolution.types';
import {
  cancelThroughWorklist,
  isRepeatedCancelOfCancelledBooking,
  lockResourcesBeforeEntry,
} from './future-commitment-cancel.helpers';
import { mapSequentially } from '../../../../shared/utils/sequential';

export interface ResolveFutureCommitmentExceptionsUseCaseInput {
  tenantId: string;
  staffId: string;
  actorRole: 'STAFF' | 'MANAGER';
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
        const snapshot = await this.lockResourcesFirst(input, exceptionId);
        const exception = await this.lockOpenEntry(exceptionId, tenantId);
        const booking = await this.loadBookingFor(exception, resolutionType, tenantId);

        if (resolutionType === 'CANCEL') {
          await cancelThroughWorklist(this.closingDeps, input, exception, booking!);
        } else if (resolutionType === 'REASSIGN') {
          const moved = await reassignThroughWorklist(
            this.worklistDeps,
            input,
            exception,
            booking!,
          );
          // The time did not change, so no BookingRescheduled: this event is what tells the
          // customer (M23-S23). Saved here, inside the callback, with the occupancy move.
          booking!.recordResourceReassigned(staffId, correlationId, moved.newResourceName);
          await this.bookingRepo.save(booking!);
          if (moved.occurrence) reassigned.push(moved.occurrence);
        } else if (resolutionType === 'RESCHEDULE') {
          await rescheduleThroughWorklist(this.worklistDeps, {
            ...input,
            scheduledAt: input.scheduledAt!,
            exception,
            booking: booking!,
            resolutionSnapshot: snapshot,
          });
        }

        exception.resolve(staffId, resolutionType, input.reason ?? null, correlationId);
        await this.exceptionRepo.save(exception);
      });
      return { exceptionId, outcome: 'RESOLVED' };
    } catch (err) {
      return this.outcomeOfFailure(err, input, exceptionId);
    }
  }

  // The resource locks come before the entry row lock for every choice that frees or moves the
  // booking (docs/28-LOCK_CATALOG.md § 2), so a cancel, a reschedule or a reactivation racing this
  // resolve cannot deadlock with it. KEEP and REASSIGN take none here: REASSIGN's lock set never
  // contains the deactivated source resource.
  private async lockResourcesFirst(
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
    exceptionId: string,
  ): Promise<ResolutionSnapshot | undefined> {
    const { tenantId, resolutionType } = input;
    if (resolutionType === 'CANCEL') {
      await lockResourcesBeforeEntry(this.closingDeps, exceptionId, tenantId);
    } else if (resolutionType === 'RESCHEDULE' && input.scheduledAt) {
      // What the lock step read is handed to the reschedule, so it resolves from the same set.
      return lockRescheduleResourcesBeforeEntry(this.worklistDeps, {
        tenantId,
        exceptionId,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
      });
    }
    return undefined;
  }

  private async outcomeOfFailure(
    err: unknown,
    input: ResolveFutureCommitmentExceptionsUseCaseInput,
    exceptionId: string,
  ): Promise<FutureCommitmentExceptionResolutionOutcome> {
    const { tenantId, resolutionType } = input;
    const repeated = { err, resolutionType };
    if (
      await isRepeatedCancelOfCancelledBooking(this.closingDeps, repeated, exceptionId, tenantId)
    ) {
      return { exceptionId, outcome: 'RESOLVED' };
    }
    if (err instanceof BookingDomainError) {
      return { exceptionId, outcome: 'STILL_OPEN', errorCode: err.code };
    }
    throw err;
  }

  private get closingDeps(): TerminalBookingDeps {
    return {
      bookingRepo: this.bookingRepo,
      occupancyRepo: this.occupancyRepo,
      exceptionRepo: this.exceptionRepo,
      tenantLock: this.tenantLock,
    };
  }

  private get worklistDeps(): WorklistRescheduleDeps {
    return {
      bookingRepo: this.bookingRepo,
      resourceRepo: this.resourceRepo,
      occupancyRepo: this.occupancyRepo,
      quoteRevisionRepo: this.quoteRevisionRepo,
      availabilityService: this.availabilityService,
      slotConflictService: this.slotConflictService,
      exceptionRepo: this.exceptionRepo,
      serviceRepo: this.serviceRepo,
      tenantLock: this.tenantLock,
    };
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
}
