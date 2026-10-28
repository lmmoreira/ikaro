import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingApprovalHoldExpiredError,
  BookingNotFoundError,
  InvalidBookingTransitionError,
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingDto } from '../dtos/approve-booking.dto';
import {
  dismissStaleExceptionsAfterMove,
  occupiedResourceIds,
} from '../helpers/booking-exception-closing.helpers';
import { moveBookingLinesOccupancy } from '../helpers/resource-occupancy-assignment.helpers';
import { toHoursSource } from './booking-hours-gate.helpers';
import {
  deriveResourceSelectionsFromAssignments,
  resolveBookingLinesResourceCandidates,
} from './resource-occupancy.helpers';
import { ResolvedLineCandidates } from '../helpers/resolved-line-candidates.types';

export type ApproveBookingUseCaseInput = ApproveBookingDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  actorRole: 'STAFF' | 'MANAGER';
  correlationId: string;
  timezone: string;
  businessHours: BusinessHours;
  tenantServiceBufferMinutes: number;
};

type CandidateResolutionInput = Pick<
  ApproveBookingUseCaseInput,
  'timezone' | 'businessHours' | 'tenantServiceBufferMinutes'
>;

export interface ApproveBookingUseCaseResult {
  bookingId: string;
  status: string;
  approvedAt: string;
}

@Injectable()
export class ApproveBookingUseCase {
  private readonly logger = new AppLogger(ApproveBookingUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
  ) {}

  async execute(input: ApproveBookingUseCaseInput): Promise<ApproveBookingUseCaseResult> {
    const { tenantId, staffId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);
    this.assertApprovable(booking);

    const isRescheduling = Boolean(input.scheduledAt);
    const scheduledAt = this.resolveScheduledAt(input, booking, isRescheduling);
    const serviceMap = await this.loadServiceMap(booking, tenantId);

    await this.approveUnderLock(booking, serviceMap, scheduledAt, isRescheduling, input);

    this.logger.log('Booking approved', { tenantId, bookingId: booking.id, staffId });

    return {
      bookingId: booking.id,
      status: booking.status,
      approvedAt: booking.approvedAt!.toISOString(),
    };
  }

  // save() stays inside the txManager.run() callback — architecture-check's transactional-save
  // detector reads the AST nesting, not the call graph.
  private async approveUnderLock(
    booking: Booking,
    serviceMap: Map<string, Service>,
    scheduledAt: Date,
    isRescheduling: boolean,
    input: ApproveBookingUseCaseInput,
  ): Promise<void> {
    const { tenantId, staffId, correlationId } = input;
    await this.txManager.run(async () => {
      await this.assertHoldNotExpired(booking, tenantId);
      const occupiedBefore = await occupiedResourceIds(this.occupancyRepo, tenantId, [booking]);
      const candidatesByLine = await this.resolveAndCheckCandidates(
        booking,
        serviceMap,
        tenantId,
        scheduledAt,
        input,
        [...occupiedBefore],
      );
      const openExceptions = await this.exceptionRepo.findOpenByAffectedForUpdate(
        tenantId,
        'BOOKING',
        [booking.id],
      );

      booking.approve(
        { type: input.actorRole, id: staffId },
        correlationId,
        isRescheduling ? scheduledAt : undefined,
      );
      await this.bookingRepo.save(booking);

      await this.applyOccupancy(candidatesByLine, tenantId);
      await dismissStaleExceptionsAfterMove(
        { occupancyRepo: this.occupancyRepo, exceptionRepo: this.exceptionRepo },
        { tenantId, booking, exceptions: openExceptions, correlationId },
      );
    });
  }

  // TD51 — the deadline lives on the booking's HOLD occupancy rows, not on the aggregate. A passed
  // deadline is refused even when the expiry job has not run yet, so the job's 30-minute schedule
  // only delays the cleanup and an approval can never commit a slot the request already lost.
  private async assertHoldNotExpired(booking: Booking, tenantId: string): Promise<void> {
    const rows = await this.occupancyRepo.findOccupancyByBookingLines(
      tenantId,
      booking.lines.map((line) => line.lineId),
    );
    const now = Date.now();
    const expired = rows.some(
      (row) =>
        row.lockState === 'HOLD' &&
        row.holdExpiresAt !== null &&
        row.holdExpiresAt.getTime() <= now,
    );
    if (expired) throw new BookingApprovalHoldExpiredError(booking.id);
  }

  private assertApprovable(booking: Booking): void {
    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.APPROVED);
    }
  }

  private resolveScheduledAt(
    input: ApproveBookingUseCaseInput,
    booking: Booking,
    isRescheduling: boolean,
  ): Date {
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : booking.scheduledAt;
    if (isRescheduling) {
      if (Number.isNaN(scheduledAt.getTime())) throw new BookingScheduledAtInvalidError();
      if (scheduledAt <= new Date()) throw new BookingScheduledInPastError();
    }
    return scheduledAt;
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }

  // Resolves the (possibly unchanged) window's candidates fresh every time — cheap, and keeps
  // this the single source of truth for "what resources does this booking occupy," same as the
  // creation path. Excluding this booking's own lines from the conflict check means it never
  // conflicts with its own existing HOLD row(s).
  private async resolveAndCheckCandidates(
    booking: Booking,
    serviceMap: Map<string, Service>,
    tenantId: string,
    scheduledAt: Date,
    input: CandidateResolutionInput,
    alsoLockResourceIds: string[],
  ): Promise<Map<string, ResolvedLineCandidates>> {
    const lineInputs = booking.lines.map((line) => ({
      lineId: line.lineId,
      serviceId: line.serviceId,
      durationMinsAtBooking: line.durationMinsAtBooking,
    }));
    const bookingLineIds = booking.lines.map((l) => l.lineId);
    const lineIdToServiceId = new Map(booking.lines.map((l) => [l.lineId, l.serviceId]));
    const resourceSelections = await deriveResourceSelectionsFromAssignments(
      this.occupancyRepo,
      tenantId,
      bookingLineIds,
      lineIdToServiceId,
    );
    const candidatesByLine = await resolveBookingLinesResourceCandidates({
      resourceRepo: this.resourceRepo,
      availabilityService: this.availabilityService,
      occupancyRepo: this.occupancyRepo,
      tenantId,
      scheduledAt,
      timezone: input.timezone,
      tenantServiceBufferMinutes: input.tenantServiceBufferMinutes,
      lines: lineInputs,
      serviceMap,
      resourceSelections,
      lockResources: (resourceIds) => this.slotConflictService.lockResources(tenantId, resourceIds),
      alsoLockResourceIds,
      // The approval commits the booking at this time, new or original, so the hours always apply
      // a request made before a closure cannot be approved into it.
      hoursSource: toHoursSource(this.closureRepo, this.openingRepo, input.businessHours),
    });
    const allCandidates = [...candidatesByLine.values()].flatMap((v) => v.candidates);
    await this.slotConflictService.assertSlotFree(tenantId, allCandidates, bookingLineIds);
    return candidatesByLine;
  }

  // Always release whatever's currently assigned to these lines (a no-op for a line with nothing
  // yet — a booking created before M22-S03 shipped, or one BackfillResourceOccupancy skipped
  // because it wasn't APPROVED yet at migration time) and assign fresh rows directly as COMMITTED,
  // from the exact candidatesByLine that assertSlotFree() just validated. Committing whatever a
  // line's ORIGINAL request-time resolution had assigned, without checking it still matches the
  // freshly re-resolved candidates, risks persisting occupancy for a resource that was never
  // re-validated (deactivated or reconfigured between request and approval) — the resource
  // assertSlotFree() actually just checked is the only one ever safe to persist. This stays cheap
  // when nothing changed: assign()'s own upsert reuses the existing assignment row for an
  // identical (line, resource, leg, quantity) tuple instead of duplicating it.
  private async applyOccupancy(
    candidatesByLine: Map<string, ResolvedLineCandidates>,
    tenantId: string,
  ): Promise<void> {
    await moveBookingLinesOccupancy(
      this.occupancyRepo,
      candidatesByLine,
      tenantId,
      'COMMITTED',
      null,
    );
  }
}
