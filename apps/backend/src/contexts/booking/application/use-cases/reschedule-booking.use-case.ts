import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { Booking } from '../../domain/booking.aggregate';
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
import { RescheduleBookingDto } from '../dtos/reschedule-booking.dto';
import { moveBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  resolveBookingLinesResourceCandidates,
  ResolvedLineCandidates,
} from './resource-occupancy.helpers';

export type RescheduleBookingUseCaseInput = RescheduleBookingDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
};

export interface RescheduleBookingUseCaseResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
}

@Injectable()
export class RescheduleBookingUseCase {
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

  async execute(input: RescheduleBookingUseCaseInput): Promise<RescheduleBookingUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const newScheduledAt = new Date(input.scheduledAt);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    const serviceMap = await this.loadServiceMap(booking, tenantId);

    await this.txManager.run(async () => {
      const candidatesByLine = await this.resolveAndCheckCandidates(
        booking,
        serviceMap,
        tenantId,
        newScheduledAt,
      );

      booking.reschedule(staffId, newScheduledAt, correlationId, input.adminNotes);
      await this.bookingRepo.save(booking);

      // Booking is always APPROVED to be reschedulable (Booking.reschedule()'s own guard) — its
      // existing occupancy row(s) are always COMMITTED, never HOLD.
      await moveBookingLinesOccupancy(
        this.occupancyRepo,
        candidatesByLine,
        tenantId,
        'COMMITTED',
        null,
      );
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt.toISOString(),
    };
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }

  // Resolves the NEW window's candidates and re-checks for conflicts, excluding this booking's
  // own existing (soon-to-be-moved) occupancy row(s) — same "a commitment never conflicts with
  // itself" guarantee UC-060 A2 requires. lockResources uses pg_advisory_xact_lock, which only
  // protects the slot check for this tx — the check must stay inside it.
  private async resolveAndCheckCandidates(
    booking: Booking,
    serviceMap: Map<string, Service>,
    tenantId: string,
    newScheduledAt: Date,
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
      newScheduledAt,
      lineInputs,
      serviceMap,
    );
    const allCandidates = [...candidatesByLine.values()].flatMap((v) => v.candidates);
    const bookingLineIds = booking.lines.map((l) => l.lineId);
    await this.slotConflictService.assertSlotFree(tenantId, allCandidates, bookingLineIds);
    return candidatesByLine;
  }
}
