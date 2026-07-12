import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { scheduleAfterCommit } from '../../../../shared/infrastructure/transaction-context';
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
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(input: SubmitBookingInfoInput): Promise<SubmitBookingInfoUseCaseResult> {
    const { tenantId, customerId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    if (booking.customerId !== customerId) throw new BookingForbiddenError();

    const { permanentPaths: photoUrls, operations } =
      await this.photoExistenceService.preparePhotoPromotion(
        input.photoUrls ?? [],
        tenantId,
        input.bookingId,
      );

    booking.submitInformation(
      booking.contactEmail.address,
      { notes: input.response },
      correlationId,
      photoUrls,
      customerId,
    );

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
      await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      infoSubmittedAt: booking.infoSubmittedAt!.toISOString(),
    };
  }
}
