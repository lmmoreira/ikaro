import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  BookingNotFoundError,
  BookingForbiddenError,
  CancellationWindowExpiredError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { CancelBookingAsCustomerDto } from '../dtos/cancel-booking-as-customer.dto';

export interface CancelBookingAsCustomerUseCaseResult {
  bookingId: string;
  status: string;
}

@Injectable()
export class CancelBookingAsCustomerUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: CancelBookingAsCustomerDto): Promise<CancelBookingAsCustomerUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const customerId = this.tenantContext.actorId!;
    const correlationId = this.tenantContext.correlationId;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    if (booking.customerId !== customerId) throw new BookingForbiddenError();

    if (booking.status === BookingStatus.APPROVED) {
      const bookingSettings = this.tenantContext.settings.booking;
      if (!booking.isEligibleForCancellation(bookingSettings.cancellationWindowHours)) {
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
