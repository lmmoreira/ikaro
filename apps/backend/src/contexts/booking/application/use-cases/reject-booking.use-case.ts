import { Inject, Injectable } from '@nestjs/common';
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
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { RejectBookingDto } from '../dtos/reject-booking.dto';
import { releaseBookingOccupancy } from './resource-occupancy-assignment.helpers';

export type RejectBookingUseCaseInput = RejectBookingDto & {
  bookingId: string;
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
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RejectBookingUseCaseInput): Promise<RejectBookingUseCaseResult> {
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
      // Releases this booking's HOLD row(s) immediately — the resource is free again right away,
      // not just after the 90-day GC sweep (M22-S03).
      await releaseBookingOccupancy(
        this.occupancyRepo,
        tenantId,
        booking.lines.map((l) => l.lineId),
      );
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      rejectedAt: booking.rejectedAt!.toISOString(),
    };
  }
}
