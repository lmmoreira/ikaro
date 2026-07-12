import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { CancelBookingAsAdminDto } from '../dtos/cancel-booking-as-admin.dto';

export type CancelBookingAsAdminInput = CancelBookingAsAdminDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
};

export interface CancelBookingAsAdminUseCaseResult {
  bookingId: string;
  status: string;
}

@Injectable()
export class CancelBookingAsAdminUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CancelBookingAsAdminInput): Promise<CancelBookingAsAdminUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    booking.cancel(staffId, true, correlationId, input.reason);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    return { bookingId: booking.id, status: booking.status };
  }
}
