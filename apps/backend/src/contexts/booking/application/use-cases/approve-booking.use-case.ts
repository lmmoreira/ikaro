import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingStatus } from '../../domain/booking.aggregate';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingDto } from '../dtos/approve-booking.dto';

export interface ApproveBookingUseCaseResult {
  bookingId: string;
  status: string;
  approvedAt: string;
}

@Injectable()
export class ApproveBookingUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async execute(dto: ApproveBookingDto): Promise<ApproveBookingUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const staffId = this.tenantContext.actorId!;
    const correlationId = this.tenantContext.correlationId;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.INFO_REQUESTED
    ) {
      throw new InvalidBookingTransitionError(booking.status, BookingStatus.APPROVED);
    }

    await this.slotConflictService.assertSlotFree(
      tenantId,
      booking.scheduledAt,
      booking.totalDurationMins,
    );

    booking.approve(staffId, correlationId);

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return {
      bookingId: booking.id,
      status: booking.status,
      approvedAt: booking.approvedAt!.toISOString(),
    };
  }
}
