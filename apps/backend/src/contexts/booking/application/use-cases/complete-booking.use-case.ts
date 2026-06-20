import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { Money } from '../../../../shared/value-objects/money';
import {
  BookingNotFoundError,
  CompleteBookingLinesIncompleteError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { CompleteBookingDto } from '../dtos/complete-booking.dto';

export interface CompleteBookingUseCaseResult {
  bookingId: string;
  status: string;
  completedAt: string;
  totalActualPrice: { amount: number; currency: string };
}

@Injectable()
export class CompleteBookingUseCase {
  constructor(
    private readonly tenantContext: RequestContext,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly photoExistenceService: PhotoExistenceService,
  ) {}

  async execute(dto: CompleteBookingDto): Promise<CompleteBookingUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const staffId = this.tenantContext.actorId!;
    const correlationId = this.tenantContext.correlationId;

    const booking = await this.bookingRepo.findById(dto.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(dto.bookingId);

    const { currency } = this.tenantContext.settings.localization;
    const requestLineIds = new Set(dto.lines.map((l) => l.lineId));
    const missingLineIds = booking.lines
      .filter((l) => !requestLineIds.has(l.lineId))
      .map((l) => l.lineId);
    if (missingLineIds.length > 0) {
      throw new CompleteBookingLinesIncompleteError(missingLineIds);
    }

    await this.photoExistenceService.assertPhotosUploaded(dto.afterServicePhotoUrls, tenantId);

    const lineActualPrices = new Map(
      dto.lines.map((l) => [l.lineId, Money.from(l.actualPriceCharged, currency)]),
    );

    booking.complete(
      staffId,
      lineActualPrices,
      dto.afterServicePhotoUrls,
      correlationId,
      dto.adminNotes,
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
      completedAt: booking.completedAt!.toISOString(),
      totalActualPrice: {
        amount: booking.totalActualPrice!.amount.toNumber(),
        currency: booking.totalActualPrice!.currency,
      },
    };
  }
}
