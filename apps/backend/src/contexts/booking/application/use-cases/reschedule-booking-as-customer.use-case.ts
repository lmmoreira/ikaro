import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  BookingScheduledInPastError,
  RescheduleWindowExpiredError,
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
import { toResourceSelections } from './booking-request.mapper';
import { RescheduleBookingAsCustomerDto } from '../dtos/reschedule-booking-as-customer.dto';
import { moveBookingLinesOccupancy } from './resource-occupancy-assignment.helpers';
import {
  QuoteRevisionResult,
  recordQuoteRevisionIfPriceChanged,
  resolveEffectiveRescheduleWindowHours,
  resolveRescheduleCandidates,
  resolveRescheduleDurationChange,
} from './reschedule-quote.helpers';
import { assertWithinEffectiveBookingWindow, TenantBookingWindow } from './booking-window.helpers';

export type RescheduleBookingAsCustomerUseCaseInput = RescheduleBookingAsCustomerDto & {
  bookingId: string;
  tenantId: string;
  customerId: string;
  correlationId: string;
  timezone: string;
  tenantDefaultRescheduleWindowHours: number;
  tenantBookingWindow: TenantBookingWindow;
};

export interface RescheduleBookingAsCustomerUseCaseResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
  quoteRevision?: QuoteRevisionResult;
}

// UC-069 customer path — mirrors CancelBookingAsCustomerUseCase's ownership/eligibility shape,
// RescheduleBookingUseCase's (admin path) resource-resolution/occupancy-move shape. Kept as its
// own use case class rather than a branch inside RescheduleBookingUseCase, same customer/admin
// split CancelBookingAsCustomerUseCase/CancelBookingAsAdminUseCase already established.
@Injectable()
export class RescheduleBookingAsCustomerUseCase {
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

  async execute(
    input: RescheduleBookingAsCustomerUseCaseInput,
  ): Promise<RescheduleBookingAsCustomerUseCaseResult> {
    const { tenantId, customerId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);
    if (booking.customerId !== customerId) throw new BookingForbiddenError();

    const newScheduledAt = new Date(input.scheduledAt);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    const serviceMap = await this.loadServiceMap(booking, tenantId);
    this.assertEligible(booking, serviceMap, input.tenantDefaultRescheduleWindowHours);
    assertWithinEffectiveBookingWindow(input, serviceMap.values());

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

  // save() stays textually inline in the txManager.run() callback below — architecture-check's
  // transactional-save detector does AST-nesting analysis, not call-graph analysis, so a save()
  // moved into a separately-named private method (even one only ever called from inside this
  // callback) is flagged as if it ran outside the transaction (docs/ENGINEERING_RULES_BACKEND.md
  // § architecture-check's transactional-save detector).
  private async rescheduleUnderLock(
    booking: Booking,
    serviceMap: Map<string, Service>,
    newScheduledAt: Date,
    durationChange: RescheduleDurationChange | undefined,
    input: RescheduleBookingAsCustomerUseCaseInput,
  ): Promise<QuoteRevisionResult | undefined> {
    const { tenantId, customerId, correlationId } = input;
    const previousTotalPrice = booking.totalPrice;
    let quoteRevision: QuoteRevisionResult | undefined;

    await this.txManager.run(async () => {
      const candidatesByLine = await resolveRescheduleCandidates(
        this.buildCandidatesParams(booking, serviceMap, newScheduledAt, durationChange, input),
      );

      booking.reschedule(
        customerId,
        newScheduledAt,
        correlationId,
        false,
        undefined,
        durationChange,
      );
      await this.bookingRepo.save(booking);

      quoteRevision = await this.moveOccupancyAndRecordRevision(
        booking,
        candidatesByLine,
        tenantId,
        previousTotalPrice,
        customerId,
      );
    });

    return quoteRevision;
  }

  private async moveOccupancyAndRecordRevision(
    booking: Booking,
    candidatesByLine: Awaited<ReturnType<typeof resolveRescheduleCandidates>>,
    tenantId: string,
    previousTotalPrice: Booking['totalPrice'],
    customerId: string,
  ): Promise<QuoteRevisionResult | undefined> {
    await moveBookingLinesOccupancy(
      this.occupancyRepo,
      candidatesByLine,
      tenantId,
      'COMMITTED',
      null,
    );
    return recordQuoteRevisionIfPriceChanged(
      this.quoteRevisionRepo,
      tenantId,
      booking.id,
      previousTotalPrice,
      booking.totalPrice,
      'CUSTOMER',
      customerId,
    );
  }

  private buildCandidatesParams(
    booking: Booking,
    serviceMap: Map<string, Service>,
    newScheduledAt: Date,
    durationChange: RescheduleDurationChange | undefined,
    input: RescheduleBookingAsCustomerUseCaseInput,
  ): Parameters<typeof resolveRescheduleCandidates>[0] {
    return {
      resourceRepo: this.resourceRepo,
      availabilityService: this.availabilityService,
      occupancyRepo: this.occupancyRepo,
      slotConflictService: this.slotConflictService,
      booking,
      serviceMap,
      tenantId: input.tenantId,
      newScheduledAt,
      timezone: input.timezone,
      overrideSelections: toResourceSelections(input.resourceSelections),
      durationChange,
    };
  }

  private assertEligible(
    booking: Booking,
    serviceMap: Map<string, Service>,
    tenantDefaultRescheduleWindowHours: number,
  ): void {
    const windowHours = resolveEffectiveRescheduleWindowHours(
      booking,
      serviceMap,
      tenantDefaultRescheduleWindowHours,
    );
    if (!booking.isEligibleForReschedule(windowHours)) throw new RescheduleWindowExpiredError();
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }
}
