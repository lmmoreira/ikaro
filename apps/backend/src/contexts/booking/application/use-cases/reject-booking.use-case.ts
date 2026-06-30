import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { RejectBookingDto } from '../dtos/reject-booking.dto';

export type RejectBookingInput = RejectBookingDto & {
  tenantId: string;
  staffId: string;
  correlationId: string;
};

export interface RejectBookingUseCaseResult {
  bookingId: string;
  status: string;
  rejectedAt: string;
}

@Injectable()
export class RejectBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(input: RejectBookingInput): Promise<RejectBookingUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.REJECTED);
    }

    booking.reject(staffId, input.reason, correlationId);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      rejectedAt: booking.rejectedAt!.toISOString(),
    };
  }
}

