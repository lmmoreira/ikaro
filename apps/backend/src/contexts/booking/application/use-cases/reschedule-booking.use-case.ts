import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RescheduleBookingDto } from '../dtos/reschedule-booking.dto';

export interface RescheduleBookingUseCaseResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
}

@Injectable()
export class RescheduleBookingUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: RescheduleBookingDto): Promise<RescheduleBookingUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const staffId = this.tenantContext.actorId!;
    const correlationId = this.tenantContext.correlationId;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    const newScheduledAt = new Date(dto.scheduledAt);
    if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

    await this.slotConflictService.assertSlotFree(
      tenantId,
      newScheduledAt,
      booking.totalDurationMins,
      booking.id,
    );

    booking.reschedule(staffId, newScheduledAt, correlationId, dto.adminNotes);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      scheduledAt: booking.scheduledAt.toISOString(),
    };
  }
}
