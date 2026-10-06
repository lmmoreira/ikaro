import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { MarkBookingNoShowDto } from '../dtos/mark-booking-no-show.dto';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';

export type MarkBookingNoShowUseCaseInput = MarkBookingNoShowDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  actorRole: 'STAFF' | 'MANAGER';
  correlationId: string;
};

export interface MarkBookingNoShowUseCaseResult {
  bookingId: string;
  status: string;
}

// UC-074 — staff or manager records that the customer did not attend. The booking save, the
// BookingNoShow outbox row and the audit row (both drained by the repository) commit together.
@Injectable()
export class MarkBookingNoShowUseCase {
  private readonly logger = new AppLogger(MarkBookingNoShowUseCase.name);

  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: MarkBookingNoShowUseCaseInput): Promise<MarkBookingNoShowUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    booking.markNoShow({ type: input.actorRole, id: staffId }, correlationId, input.reason);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    this.logger.log('Booking marked as no-show', { tenantId, bookingId: booking.id, staffId });

    return { bookingId: booking.id, status: booking.status };
  }
}
