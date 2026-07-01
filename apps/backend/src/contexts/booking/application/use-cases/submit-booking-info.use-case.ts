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
import { SubmitBookingInfoDto } from '../dtos/submit-booking-info.dto';

export type SubmitBookingInfoInput = SubmitBookingInfoDto & {
  tenantId: string;
  customerId: string;
  correlationId: string;
};

export interface SubmitBookingInfoUseCaseResult {
  bookingId: string;
  status: string;
  infoSubmittedAt: string;
}

@Injectable()
export class SubmitBookingInfoUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(input: SubmitBookingInfoInput): Promise<SubmitBookingInfoUseCaseResult> {
    const { tenantId, customerId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (booking.customerId !== customerId) throw new BookingForbiddenError();

    await this.photoExistenceService.assertPhotosUploaded(input.photoUrls ?? [], tenantId);

    booking.submitInformation(
      booking.contactEmail.address,
      { notes: input.response },
      correlationId,
      input.photoUrls ?? [],
      customerId,
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
