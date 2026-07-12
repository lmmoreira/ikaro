import { Inject, Injectable } from '@nestjs/common';
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
import { BookingStatus } from '../../domain/booking.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingDto } from '../dtos/approve-booking.dto';

export type ApproveBookingInput = ApproveBookingDto & {
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
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ApproveBookingInput): Promise<ApproveBookingUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.APPROVED);
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : booking.scheduledAt;
    if (input.scheduledAt) {
      if (Number.isNaN(scheduledAt.getTime())) throw new BookingScheduledAtInvalidError();
      if (scheduledAt <= new Date()) throw new BookingScheduledInPastError();
    }

    await this.slotConflictService.assertSlotFree(
      tenantId,
      scheduledAt,
      booking.totalDurationMins,
      input.timezone,
    );

    booking.approve(staffId, correlationId, input.scheduledAt ? scheduledAt : undefined);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      approvedAt: booking.approvedAt!.toISOString(),
    };
  }
}
