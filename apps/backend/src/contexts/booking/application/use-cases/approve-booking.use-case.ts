import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingDto } from '../dtos/approve-booking.dto';
import { moveBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
} from './resource-occupancy.helpers';

export type ApproveBookingUseCaseInput = ApproveBookingDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
};

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
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ApproveBookingUseCaseInput): Promise<ApproveBookingUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);
    this.assertApprovable(booking);

    const isRescheduling = Boolean(input.scheduledAt);
    const scheduledAt = this.resolveScheduledAt(input, booking, isRescheduling);
    const serviceMap = await this.loadServiceMap(booking, tenantId);

    await this.txManager.run(async () => {
      const candidatesByLine = await this.resolveAndCheckCandidates(
        booking,
        serviceMap,
        tenantId,
        scheduledAt,
      );

      booking.approve(staffId, correlationId, isRescheduling ? scheduledAt : undefined);
      await this.bookingRepo.save(booking);

      await this.applyOccupancy(booking, candidatesByLine, tenantId, isRescheduling);
    });

    this.logger.log('Booking approved', { tenantId, bookingId: booking.id, staffId });

    return {
      bookingId: booking.id,
      status: booking.status,
      approvedAt: booking.approvedAt!.toISOString(),
    };
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
  ): Promise<Map<string, ResolvedLineCandidates>> {
    const lineInputs = booking.lines.map((line) => ({
      lineId: line.lineId,
      serviceId: line.serviceId,
      durationMinsAtBooking: line.durationMinsAtBooking,
    }));
    const candidatesByLine = await resolveBookingLinesResourceCandidates(
      this.resourceRepo,
      this.availabilityService,
      tenantId,
      scheduledAt,
      lineInputs,
      serviceMap,
    );
    const allCandidates = [...candidatesByLine.values()].flatMap((v) => v.candidates);
    const bookingLineIds = booking.lines.map((l) => l.lineId);
    await this.slotConflictService.assertSlotFree(tenantId, allCandidates, bookingLineIds);
    return candidatesByLine;
  }

  // Same window: HOLD/REQUESTED -> COMMITTED in place (occupancyRepo.commit() transitions
  // unconditionally regardless of prior lock_state). Changed window (an approval-time
  // reschedule): release the old row(s) and commit fresh ones at the new window.
  private async applyOccupancy(
    booking: Booking,
    candidatesByLine: Map<string, ResolvedLineCandidates>,
    tenantId: string,
    isRescheduling: boolean,
  ): Promise<void> {
    const bookingLineIds = booking.lines.map((l) => l.lineId);
    if (isRescheduling) {
      await moveBookingLinesOccupancy(
        this.occupancyRepo,
        candidatesByLine,
        tenantId,
        'COMMITTED',
        null,
      );
    } else {
      await this.occupancyRepo.commit(tenantId, bookingLineIds);
    }
  }
}
