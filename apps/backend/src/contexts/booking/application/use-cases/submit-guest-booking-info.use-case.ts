import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingForbiddenError,
  BookingNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { SubmitGuestBookingInfoDto } from '../dtos/submit-guest-booking-info.dto';

export type SubmitGuestBookingInfoInput = SubmitGuestBookingInfoDto & {
  tenantId: string;
  correlationId: string;
};

export interface SubmitGuestBookingInfoUseCaseResult {
  bookingId: string;
  status: string;
  infoSubmittedAt: string;
}

@Injectable()
export class SubmitGuestBookingInfoUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(input: SubmitGuestBookingInfoInput): Promise<SubmitGuestBookingInfoUseCaseResult> {
    const { tenantId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (booking.customerId !== null) throw new BookingForbiddenError();

    await this.photoExistenceService.assertPhotosUploaded(input.photoUrls ?? [], tenantId);

    booking.submitInformation(
      input.contactEmail,
      { notes: input.response },
      correlationId,
      input.photoUrls ?? [],
    );

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      infoSubmittedAt: booking.infoSubmittedAt!.toISOString(),
    };
  }
}
