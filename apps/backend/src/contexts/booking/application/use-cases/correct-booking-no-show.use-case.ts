import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingStatus } from '../../domain/booking.types';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { CorrectBookingNoShowDto } from '../dtos/correct-booking-no-show.dto';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IBookingStatusTransitionRepository,
  BOOKING_STATUS_TRANSITION_REPOSITORY,
} from '../ports/booking-status-transition-repository.port';

export type CorrectBookingNoShowUseCaseInput = CorrectBookingNoShowDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
};

export interface CorrectBookingNoShowUseCaseResult {
  bookingId: string;
  status: string;
  completedAt: string;
}

// UC-074 A3 — a manager corrects a mistaken no-show to COMPLETED. The booking is completed at its
// booked prices and publishes BookingCompleted (never BookingNoShow again), so the existing
// Loyalty consumer awards the service points exactly once, at this correction.
@Injectable()
export class CorrectBookingNoShowUseCase {
  private readonly logger = new AppLogger(CorrectBookingNoShowUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_STATUS_TRANSITION_REPOSITORY)
    private readonly transitionRepo: IBookingStatusTransitionRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CorrectBookingNoShowUseCaseInput,
  ): Promise<CorrectBookingNoShowUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const fromStatus = booking.status;
    booking.correctNoShow(staffId, correlationId);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
      await this.transitionRepo.save(
        BookingStatusTransition.record({
          tenantId,
          bookingId: booking.id,
          fromStatus,
          toStatus: BookingStatus.COMPLETED,
          reason: input.reason,
          actorType: 'MANAGER',
          actorId: staffId,
          correlationId,
        }),
      );
    });

    this.logger.log('No-show corrected to completed', {
      tenantId,
      bookingId: booking.id,
      staffId,
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      completedAt: booking.completedAt!.toISOString(),
    };
  }
}
