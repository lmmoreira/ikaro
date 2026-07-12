import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
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

export type CompleteBookingInput = CompleteBookingDto & {
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
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(input: CompleteBookingInput): Promise<CompleteBookingUseCaseResult> {
    const { tenantId, staffId, correlationId, currency } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const requestLineIds = new Set(input.lines.map((l) => l.lineId));
    const missingLineIds = booking.lines
      .filter((l) => !requestLineIds.has(l.lineId))
      .map((l) => l.lineId);
    if (missingLineIds.length > 0) {
      throw new CompleteBookingLinesIncompleteError(missingLineIds);
    }

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
      await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
    });

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

  private validateDiscount(input: CompleteBookingInput, booking: Booking): void {
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
