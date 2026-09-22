import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { Booking } from '../../domain/booking.aggregate';
import {
  BookingDiscountDisabledError,
  BookingDiscountMismatchError,
  BookingDiscountNotAvailableError,
  BookingNotFoundError,
  CompleteBookingLinesIncompleteError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { CompleteBookingDto } from '../dtos/complete-booking.dto';

export type CompleteBookingUseCaseInput = CompleteBookingDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
  currency: string;
  pointsPerCurrencyUnit: number;
};

export interface CompleteBookingUseCaseResult {
  bookingId: string;
  status: string;
  completedAt: string;
  totalActualPrice: { amount: number; currency: string };
}

@Injectable()
export class CompleteBookingUseCase {
  private readonly logger = new AppLogger(CompleteBookingUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(input: CompleteBookingUseCaseInput): Promise<CompleteBookingUseCaseResult> {
    const { tenantId, staffId, correlationId, currency } = input;

    const booking = await this.findAndValidateBooking(input, tenantId);

    const { permanentPaths: afterServicePhotoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.afterServicePhotoUrls,
        tenantId,
        input.bookingId,
      );

    this.validateDiscount(input, booking);

    const lineActualPrices = new Map(
      input.lines.map((l) => [l.lineId, Money.from(l.actualPriceCharged, currency)]),
    );

    booking.complete(
      staffId,
      lineActualPrices,
      afterServicePhotoUrls,
      correlationId,
      input.adminNotes,
      input.discountByPoints,
    );

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
      await this.txManager.scheduleAfterCommit(() =>
        this.photoExistenceService.executePhotoPromotion(operations),
      );
    });

    this.logger.log('Booking completed', {
      tenantId,
      bookingId: booking.id,
      staffId,
    });

    return this.buildResult(booking);
  }

  private async findAndValidateBooking(
    input: CompleteBookingUseCaseInput,
    tenantId: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const requestLineIds = new Set(input.lines.map((l) => l.lineId));
    const missingLineIds = booking.lines
      .filter((l) => !requestLineIds.has(l.lineId))
      .map((l) => l.lineId);
    if (missingLineIds.length > 0) {
      throw new CompleteBookingLinesIncompleteError(missingLineIds);
    }
    return booking;
  }

  private buildResult(booking: Booking): CompleteBookingUseCaseResult {
    return {
      bookingId: booking.id,
      status: booking.status,
      completedAt: booking.completedAt!.toISOString(),
      totalActualPrice: {
        amount: booking.totalActualPrice!.amount.toNumber(),
        currency: booking.totalActualPrice!.currency,
      },
    };
  }

  private validateDiscount(input: CompleteBookingUseCaseInput, booking: Booking): void {
    if (!input.discountByPoints) return;

    if (booking.customerId === null) throw new BookingDiscountNotAvailableError();

    const { pointsPerCurrencyUnit } = input;
    if (pointsPerCurrencyUnit === 0) throw new BookingDiscountDisabledError();

    const expectedAmountDeducted = Math.floor(
      input.discountByPoints.pointsUsed / pointsPerCurrencyUnit,
    );
    const roundedAmountDeducted = Math.round(input.discountByPoints.amountDeducted * 100) / 100;
    if (roundedAmountDeducted !== expectedAmountDeducted) {
      throw new BookingDiscountMismatchError();
    }
  }
}
