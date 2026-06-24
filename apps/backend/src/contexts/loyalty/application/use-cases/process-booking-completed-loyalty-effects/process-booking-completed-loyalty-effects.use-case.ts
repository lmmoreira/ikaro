import { Inject, Injectable } from '@nestjs/common';
import { ILoyaltyPlatformPort, LOYALTY_PLATFORM_PORT } from '../../ports/loyalty-platform.port';
import {
  IProcessedEventRepository,
  PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';
import {
  BookingCompletedLine,
  RecordLoyaltyEntriesUseCase,
} from '../record-loyalty-entries/record-loyalty-entries.use-case';
import { RedeemPointsUseCase } from '../redeem-points/redeem-points.use-case';

export interface ProcessBookingCompletedLoyaltyEffectsDto {
  tenantId: string;
  eventId: string;
  correlationId: string;
  customerId: string | null;
  bookingId: string;
  completedBy: string;
  lines: BookingCompletedLine[];
  discountByPoints?: { pointsUsed: number; amountDeducted: number };
}

@Injectable()
export class ProcessBookingCompletedLoyaltyEffectsUseCase {
  static readonly CONSUMER_NAME = 'PROCESS_BOOKING_COMPLETED_LOYALTY_EFFECTS';
  static readonly REDEMPTION_CONSUMER_NAME = 'REDEEM_POINTS_ON_COMPLETION';

  constructor(
    private readonly recordLoyaltyEntries: RecordLoyaltyEntriesUseCase,
    private readonly redeemPoints: RedeemPointsUseCase,
    @Inject(PROCESSED_EVENT_REPOSITORY)
    private readonly processedEventRepo: IProcessedEventRepository,
    @Inject(LOYALTY_PLATFORM_PORT) private readonly tenantSettingsPort: ILoyaltyPlatformPort,
  ) {}

  async execute(dto: ProcessBookingCompletedLoyaltyEffectsDto): Promise<void> {
    await this.recordLoyaltyEntries.execute({
      tenantId: dto.tenantId,
      eventId: dto.eventId,
      correlationId: dto.correlationId,
      customerId: dto.customerId,
      bookingId: dto.bookingId,
      lines: dto.lines,
    });

    if (!dto.discountByPoints || !dto.customerId) return;

    const alreadyRedeemed = await this.processedEventRepo.hasBeenProcessed(
      dto.eventId,
      ProcessBookingCompletedLoyaltyEffectsUseCase.REDEMPTION_CONSUMER_NAME,
    );
    if (alreadyRedeemed) return;

    const { pointsPerCurrencyUnit } = await this.tenantSettingsPort.getLoyaltySettings(
      dto.tenantId,
    );

    await this.redeemPoints.execute({
      tenantId: dto.tenantId,
      customerId: dto.customerId,
      pointsToRedeem: dto.discountByPoints.pointsUsed,
      pointsPerCurrencyUnit,
      redeemedBy: dto.completedBy,
      bookingId: dto.bookingId,
      notes: 'Desconto na conclusão do agendamento',
    });

    await this.processedEventRepo.markProcessed(
      dto.eventId,
      ProcessBookingCompletedLoyaltyEffectsUseCase.REDEMPTION_CONSUMER_NAME,
    );
  }
}
