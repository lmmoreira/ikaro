import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { CancelBookingAsAdminDto } from '../dtos/cancel-booking-as-admin.dto';
import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';

export type CancelBookingAsAdminUseCaseInput = CancelBookingAsAdminDto & {
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
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: CancelBookingAsAdminUseCaseInput,
  ): Promise<CancelBookingAsAdminUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    booking.cancel(staffId, true, correlationId, input.reason);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
      await releaseBookingOccupancy(
        this.occupancyRepo,
        tenantId,
        booking.lines.map((l) => l.lineId),
      );
    });

    return { bookingId: booking.id, status: booking.status };
  }
}
