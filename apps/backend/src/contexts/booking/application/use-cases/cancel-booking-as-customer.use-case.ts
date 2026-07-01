import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingNotFoundError,
  BookingForbiddenError,
  CancellationWindowExpiredError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
export type CancelBookingAsCustomerInput = {
  bookingId: string;
  tenantId: string;
  customerId: string;
  correlationId: string;
  cancellationWindowHours: number;
};

export interface CancelBookingAsCustomerUseCaseResult {
  bookingId: string;
  status: string;
}

@Injectable()
export class CancelBookingAsCustomerUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(
    input: CancelBookingAsCustomerInput,
  ): Promise<CancelBookingAsCustomerUseCaseResult> {
    const { tenantId, customerId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (booking.customerId !== customerId) throw new BookingForbiddenError();

    if (booking.status === BookingStatus.APPROVED) {
      if (!booking.isEligibleForCancellation(input.cancellationWindowHours)) {
        throw new CancellationWindowExpiredError();
      }
    }

    booking.cancel(customerId, false, correlationId);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return { bookingId: booking.id, status: booking.status };
  }
}
