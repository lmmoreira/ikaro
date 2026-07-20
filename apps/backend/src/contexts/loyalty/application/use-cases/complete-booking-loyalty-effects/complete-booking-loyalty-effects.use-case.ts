import { Inject, Injectable } from '@nestjs/common';
import {
  IOutboxPublisher,
  OUTBOX_PUBLISHER,
} from '../../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { LoyaltyBalance } from '../../../domain/loyalty-balance.aggregate';
import { LoyaltyEntry } from '../../../domain/loyalty-entry.aggregate';
import { LoyaltyRedemption } from '../../../domain/loyalty-redemption.aggregate';
import { ServicePointsEarned } from '../../../domain/events/service-points-earned.event';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';
import {
  ILoyaltyRedemptionRepository,
  LOYALTY_REDEMPTION_REPOSITORY,
} from '../../ports/loyalty-redemption-repository.port';
import { ILoyaltyPlatformPort, LOYALTY_PLATFORM_PORT } from '../../ports/loyalty-platform.port';
import { IInboxRepository, INBOX_REPOSITORY } from '../../../../../shared/ports/inbox.port';

export interface BookingCompletedLine {
  lineId: string;
  serviceId: string;
  pointsValueAtBooking: number;
}

export interface CompleteBookingLoyaltyEffectsUseCaseInput {
  tenantId: string;
  eventId: string;
  correlationId: string;
  customerId: string | null;
  bookingId: string;
  completedBy: string;
  lines: BookingCompletedLine[];
  discountByPoints?: { pointsUsed: number; amountDeducted: number };
}

export interface CompleteBookingLoyaltyEffectsUseCaseResult {
  skipped: boolean;
  entriesCreated: number;
  totalPointsEarned: number;
  pointsRedeemed: number;
}

const SKIPPED_RESULT: CompleteBookingLoyaltyEffectsUseCaseResult = {
  skipped: true,
  entriesCreated: 0,
  totalPointsEarned: 0,
  pointsRedeemed: 0,
};

/**
 * The single, self-contained reaction to `BookingCompleted`: records earned points
 * and — if a loyalty discount was applied at completion — redeems points, all in
 * one transaction with one idempotency check against the triggering event.
 */
@Injectable()
export class CompleteBookingLoyaltyEffectsUseCase {
  static readonly CONSUMER_NAME = 'complete-booking-loyalty-effects';

  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(LOYALTY_REDEMPTION_REPOSITORY)
    private readonly redemptionRepo: ILoyaltyRedemptionRepository,
    @Inject(INBOX_REPOSITORY)
    private readonly inboxRepo: IInboxRepository,
    @Inject(LOYALTY_PLATFORM_PORT)
    private readonly tenantSettingsPort: ILoyaltyPlatformPort,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
  ): Promise<CompleteBookingLoyaltyEffectsUseCaseResult> {
    if (dto.customerId === null) return SKIPPED_RESULT;

    const alreadyProcessed = await this.inboxRepo.hasBeenProcessed(
      dto.eventId,
      CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
    );
    if (alreadyProcessed) return SKIPPED_RESULT;

    const { expiryDays, pointsPerCurrencyUnit } = await this.tenantSettingsPort.getLoyaltySettings(
      dto.tenantId,
    );

    const totalPointsEarned = dto.lines.reduce((sum, l) => sum + l.pointsValueAtBooking, 0);
    const pointsRedeemed = dto.discountByPoints?.pointsUsed ?? 0;
    const customerId = dto.customerId;

    const balance =
      (await this.balanceRepo.findByCustomer(dto.tenantId, customerId)) ??
      LoyaltyBalance.create(dto.tenantId, customerId);

    const entries = dto.lines.map((line) =>
      LoyaltyEntry.record({
        tenantId: dto.tenantId,
        customerId,
        bookingId: dto.bookingId,
        bookingLineId: line.lineId,
        serviceId: line.serviceId,
        points: line.pointsValueAtBooking,
        expiryDays,
      }),
    );
    balance.increment(totalPointsEarned);

    let redemption: LoyaltyRedemption | null = null;
    if (pointsRedeemed > 0) {
      balance.decrement(pointsRedeemed);
      redemption = LoyaltyRedemption.record({
        tenantId: dto.tenantId,
        customerId,
        pointsRedeemed,
        pointsPerCurrencyUnit,
        redeemedBy: dto.completedBy,
        bookingId: dto.bookingId,
      });
    }

    const finalBalance = balance.currentPoints;

    const servicePointsEarned = new ServicePointsEarned(dto.tenantId, dto.correlationId, {
      customerId,
      bookingId: dto.bookingId,
      totalPointsEarned,
      earnedAt: entries[0].earnedAt.toISOString(),
      lines: entries.map((e) => ({
        entryId: e.id,
        serviceId: e.serviceId,
        pointsEarned: e.points,
        expiresAt: e.expiresAt.toISOString(),
      })),
      currentBalance: finalBalance,
    });

    // TD08 §12.3: the re-emit and the idempotency mark are one atomic fact — a crash between
    // this transaction and a separately-published event used to leave ServicePointsEarned lost
    // forever, since hasBeenProcessed() short-circuits any redelivery of BookingCompleted.
    await this.txManager.run(async () => {
      for (const entry of entries) {
        await this.entryRepo.save(entry);
      }
      await this.balanceRepo.upsert(balance);
      if (redemption) await this.redemptionRepo.save(redemption);
      await this.inboxRepo.markProcessed(
        dto.eventId,
        CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
      );
      await this.outboxPublisher.publish(servicePointsEarned);
    });

    return {
      skipped: false,
      entriesCreated: entries.length,
      totalPointsEarned,
      pointsRedeemed,
    };
  }
}
