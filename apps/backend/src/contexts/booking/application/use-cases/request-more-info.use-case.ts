import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { RequestMoreInfoDto } from '../dtos/request-more-info.dto';

export type RequestMoreInfoInput = RequestMoreInfoDto & {
  tenantId: string;
  staffId: string;
  correlationId: string;
};

export interface RequestMoreInfoUseCaseResult {
  bookingId: string;
  status: string;
  infoRequestedAt: string;
}

@Injectable()
export class RequestMoreInfoUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(input: RequestMoreInfoInput): Promise<RequestMoreInfoUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    booking.requestMoreInfo(staffId, input.message, correlationId);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      infoRequestedAt: booking.infoRequestedAt!.toISOString(),
    };
  }
}

