import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingForbiddenError,
  BookingNotFoundError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { Booking } from '../../domain/booking.aggregate';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
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
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingQuoteService } from '../services/booking-quote.service';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { toHoursSource } from './booking-hours-gate.helpers';
import { toResourceSelections } from './booking-request.mapper';
import { RescheduleBookingAsCustomerDto } from '../dtos/reschedule-booking-as-customer.dto';
import {
  dismissStaleExceptionsAfterMove,
  occupiedResourceIds,
} from '../helpers/booking-exception-closing.helpers';
import { moveBookingLinesOccupancy } from '../helpers/resource-occupancy-assignment.helpers';
import {
  assertEligibleForReschedule,
  QuoteRevisionResult,
  recordQuoteRevisionIfPriceChanged,
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
  businessHours: BusinessHours;
  tenantServiceBufferMinutes: number;
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
    @Inject(SCHEDULE_CLOSURE_REPOSITORY) private readonly closureRepo: IScheduleClosureRepository,
    @Inject(SCHEDULE_OPENING_REPOSITORY) private readonly openingRepo: IScheduleOpeningRepository,
    private readonly availabilityService: AvailabilityService,
    private readonly slotConflictService: BookingSlotConflictService,
    private readonly quoteService: BookingQuoteService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
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
    assertEligibleForReschedule(booking, serviceMap, input.tenantDefaultRescheduleWindowHours);
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
    const { customerId, correlationId } = input;
    const previousTotalPrice = booking.totalPrice;
    let quoteRevision: QuoteRevisionResult | undefined;

    await this.txManager.run(async () => {
      const { candidatesByLine, openExceptions } = await this.resolveAndLockExceptions(
        booking,
        serviceMap,
        newScheduledAt,
        durationChange,
        input,
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
        { booking, candidatesByLine, openExceptions },
        input,
        previousTotalPrice,
      );
    });

    return quoteRevision;
  }

  // Resource locks (the old resources included) first, then the booking's open entries, both before
  // the booking row is written (docs/LOCK_CATALOG.md § 2).
  private async resolveAndLockExceptions(
    booking: Booking,
    serviceMap: Map<string, Service>,
    newScheduledAt: Date,
    durationChange: RescheduleDurationChange | undefined,
    input: RescheduleBookingAsCustomerUseCaseInput,
  ) {
    const { tenantId } = input;
    const occupiedBefore = await occupiedResourceIds(this.occupancyRepo, tenantId, [booking]);
    const candidatesByLine = await resolveRescheduleCandidates({
      ...this.buildCandidatesParams(booking, serviceMap, newScheduledAt, durationChange, input),
      alsoLockResourceIds: [...occupiedBefore],
    });
    const openExceptions = await this.exceptionRepo.findOpenByAffectedForUpdate(
      tenantId,
      'BOOKING',
      [booking.id],
    );
    return { candidatesByLine, openExceptions };
  }

  private async moveOccupancyAndRecordRevision(
    moved: {
      booking: Booking;
      candidatesByLine: Awaited<ReturnType<typeof resolveRescheduleCandidates>>;
      openExceptions: FutureCommitmentException[];
    },
    input: RescheduleBookingAsCustomerUseCaseInput,
    previousTotalPrice: Booking['totalPrice'],
  ): Promise<QuoteRevisionResult | undefined> {
    const { tenantId, customerId, correlationId } = input;
    const { booking, candidatesByLine, openExceptions } = moved;
    await moveBookingLinesOccupancy(
      this.occupancyRepo,
      candidatesByLine,
      tenantId,
      'COMMITTED',
      null,
    );
    await dismissStaleExceptionsAfterMove(
      { occupancyRepo: this.occupancyRepo, exceptionRepo: this.exceptionRepo },
      { tenantId, booking, exceptions: openExceptions, correlationId },
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
      tenantServiceBufferMinutes: input.tenantServiceBufferMinutes,
      overrideSelections: toResourceSelections(input.resourceSelections),
      durationChange,
      hoursSource: toHoursSource(this.closureRepo, this.openingRepo, input.businessHours),
    };
  }

  private async loadServiceMap(booking: Booking, tenantId: string): Promise<Map<string, Service>> {
    const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
    const services = await this.serviceRepo.findByIds(serviceIds, tenantId);
    return new Map(services.map((s) => [s.id, s]));
  }
}
