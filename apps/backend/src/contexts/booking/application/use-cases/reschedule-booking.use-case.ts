import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RescheduleBookingDto } from '../dtos/reschedule-booking.dto';

export type RescheduleBookingInput = RescheduleBookingDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
};

export interface RescheduleBookingUseCaseResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
}

@Injectable()
export class RescheduleBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: RescheduleBookingInput): Promise<RescheduleBookingUseCaseResult> {
    const { tenantId, staffId, correlationId, timezone } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    const newScheduledAt = new Date(input.scheduledAt);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    await this.txManager.run(async () => {
      // This validation must stay inside the write transaction because lockTenantDay
      // uses pg_advisory_xact_lock, which only protects the slot check for this tx.
      await this.slotConflictService.assertSlotFree(
        tenantId,
        newScheduledAt,
        booking.totalDurationMins,
        timezone,
        booking.id,
      );
      booking.reschedule(staffId, newScheduledAt, correlationId, input.adminNotes);
      await this.bookingRepo.save(booking);
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt.toISOString(),
    };
  }
}
