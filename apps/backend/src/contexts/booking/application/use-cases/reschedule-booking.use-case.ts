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
import { RescheduleDurationChange } from '../../domain/booking.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { Service } from '../../domain/service.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  BOOKING_QUOTE_REVISION_REPOSITORY,
  IBookingQuoteRevisionRepository,
} from '../ports/booking-quote-revision-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RescheduleBookingDto } from '../dtos/reschedule-booking.dto';
import { toResourceSelections } from './booking-request.mapper';
import { rescheduleBookingInTransaction } from './reschedule-booking-in-transaction.helpers';
import { QuoteRevisionResult, resolveRescheduleDurationChange } from './reschedule-quote.helpers';

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
  quoteRevision?: QuoteRevisionResult;
}

// UC-069 A3 (staff override) — never runs the reschedule-window eligibility check
// (RescheduleBookingAsCustomerUseCase's customer path does). Otherwise the same
// resource-resolution/occupancy-move/quote-revision shape.
@Injectable()
export class RescheduleBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(BOOKING_QUOTE_REVISION_REPOSITORY)
    private readonly quoteRevisionRepo: IBookingQuoteRevisionRepository,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly quoteService: BookingQuoteService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RescheduleBookingUseCaseInput): Promise<RescheduleBookingUseCaseResult> {
    const { tenantId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const newScheduledAt = new Date(input.scheduledAt);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    const serviceMap = await this.loadServiceMap(booking, tenantId);
    const durationChange = resolveRescheduleDurationChange(
      booking,
      serviceMap,
      this.quoteService,
      input.durationMinutes,
    );
    const quoteRevision = await this.rescheduleUnderLock(
      booking,
      serviceMap,
      newScheduledAt,
      durationChange,
      input,
    );

    return {
      bookingId: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt.toISOString(),
      quoteRevision,
    };
  }

  private async rescheduleUnderLock(
    booking: Booking,
    serviceMap: Map<string, Service>,
    newScheduledAt: Date,
    durationChange: RescheduleDurationChange | undefined,
    input: RescheduleBookingUseCaseInput,
  ): Promise<QuoteRevisionResult | undefined> {
    return this.txManager.run(() =>
      rescheduleBookingInTransaction(
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
          serviceMap,
          newScheduledAt,
          durationChange,
          overrideSelections: toResourceSelections(input.resourceSelections),
          adminNotes: input.adminNotes,
          tenantId: input.tenantId,
          staffId: input.staffId,
          correlationId: input.correlationId,
          timezone: input.timezone,
        },
      ),
    );
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }
}
