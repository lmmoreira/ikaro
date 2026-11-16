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
import {
  TENANT_ACCESS_PORT,
  type TenantAccessPort,
} from '../../../../../shared/ports/tenant-access.port';
import { AppLogger } from '../../../../../shared/observability/app-logger';

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
 *
 * Earning and settlement are one atomic write of the customer's balance, so this is the one place
 * the tenant's access is read instead of the declarative event gate (UC-121, UC-125): the gate can
 * skip a whole handler, not half of one transaction. A discount was already applied to the booking
 * when it completed, so the redemption is always settled; points are earned only while the tenant
 * is operational and entitled to LOYALTY (the lookup fails open, like the gate).
 */
interface SettlementPlan {
  dto: CompleteBookingLoyaltyEffectsUseCaseInput;
  customerId: string;
  entries: LoyaltyEntry[];
  totalPointsEarned: number;
  mayEarn: boolean;
  pointsRedeemed: number;
  pointsPerCurrencyUnit: number;
}

@Injectable()
export class CompleteBookingLoyaltyEffectsUseCase {
  static readonly CONSUMER_NAME = 'complete-booking-loyalty-effects';

  private readonly logger = new AppLogger(CompleteBookingLoyaltyEffectsUseCase.name);

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
    @Inject(TENANT_ACCESS_PORT) private readonly tenantAccess: TenantAccessPort,
  ) {}

  async execute(
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
  ): Promise<CompleteBookingLoyaltyEffectsUseCaseResult> {
    if (dto.customerId === null) return SKIPPED_RESULT;
    if (await this.isAlreadyProcessed(dto.eventId)) return SKIPPED_RESULT;

    const customerId = dto.customerId;
    const { expiryDays, pointsPerCurrencyUnit } = await this.tenantSettingsPort.getLoyaltySettings(
      dto.tenantId,
    );
    const pointsRedeemed = dto.discountByPoints?.pointsUsed ?? 0;
    const mayEarn = await this.mayEarnPoints(dto);
    if (!mayEarn && pointsRedeemed <= 0) return this.markProcessedWithoutRecording(dto);

    const entries = mayEarn ? this.buildEntries(dto, customerId, expiryDays) : [];
    const totalPointsEarned = entries.reduce((sum, entry) => sum + entry.points, 0);

    const applied = await this.settle({
      dto,
      customerId,
      entries,
      totalPointsEarned,
      mayEarn,
      pointsRedeemed,
      pointsPerCurrencyUnit,
    });
    if (!applied) return SKIPPED_RESULT;

    return { skipped: false, entriesCreated: entries.length, totalPointsEarned, pointsRedeemed };
  }

  // One transaction. The balance row is locked first (docs/LOCK_CATALOG.md R6), then the inbox is
  // checked again: a concurrent delivery of this event may have committed while this one waited
  // for the lock. Returns false when the event was already processed. TD08 §12.3: the re-emit and
  // the idempotency mark are one atomic fact: a crash between this transaction and a
  // separately-published event used to leave ServicePointsEarned lost forever, since
  // hasBeenProcessed() short-circuits any redelivery of BookingCompleted.
  private async settle(plan: SettlementPlan): Promise<boolean> {
    const { dto, customerId, entries } = plan;
    return this.txManager.run(async () => {
      const balance = await this.balanceRepo.findOrCreateByCustomerForUpdate(
        dto.tenantId,
        customerId,
      );
      if (await this.isAlreadyProcessed(dto.eventId)) return false;
      const { redemption, servicePointsEarned } = this.applyToBalance(balance, plan);

      for (const entry of entries) {
        await this.entryRepo.save(entry);
      }
      await this.balanceRepo.upsert(balance);
      if (redemption) await this.redemptionRepo.save(redemption);
      await this.inboxRepo.markProcessed(
        dto.eventId,
        CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
      );
      if (servicePointsEarned) await this.outboxPublisher.publish(servicePointsEarned);
      return true;
    });
  }

  private applyToBalance(
    balance: LoyaltyBalance,
    plan: SettlementPlan,
  ): { redemption: LoyaltyRedemption | null; servicePointsEarned: ServicePointsEarned | null } {
    const { dto, customerId, entries, totalPointsEarned, mayEarn } = plan;
    if (mayEarn) balance.increment(totalPointsEarned);
    const redemption = this.applyRedemption(
      balance,
      dto,
      customerId,
      plan.pointsRedeemed,
      plan.pointsPerCurrencyUnit,
    );
    const servicePointsEarned = mayEarn
      ? this.buildServicePointsEarnedEvent(
          dto,
          customerId,
          totalPointsEarned,
          entries,
          balance.currentPoints,
        )
      : null;
    return { redemption, servicePointsEarned };
  }

  // Earning is not allowed and no discount was spent: nothing to record. The event is still marked
  // processed, so a duplicate delivered after access is restored cannot earn for it.
  private async markProcessedWithoutRecording(
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
  ): Promise<CompleteBookingLoyaltyEffectsUseCaseResult> {
    await this.txManager.run(() =>
      this.inboxRepo.markProcessed(dto.eventId, CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME),
    );
    return SKIPPED_RESULT;
  }

  // Read before the transaction opens: no cross-service call inside txManager.run().
  private async mayEarnPoints(dto: CompleteBookingLoyaltyEffectsUseCaseInput): Promise<boolean> {
    try {
      const access = await this.tenantAccess.getAccess(dto.tenantId);
      const allowed = access.operational && access.features.some((f) => f.key === 'LOYALTY');
      if (!allowed) {
        this.logger.log('Points not earned: tenant is suspended or not entitled to LOYALTY', {
          tenantId: dto.tenantId,
          eventId: dto.eventId,
          bookingId: dto.bookingId,
        });
      }
      return allowed;
    } catch (err) {
      this.logger.warn('Tenant access lookup failed; earning points anyway', {
        tenantId: dto.tenantId,
        eventId: dto.eventId,
        error: err instanceof Error ? err.message : String(err),
      });
      return true;
    }
  }

  private isAlreadyProcessed(eventId: string): Promise<boolean> {
    return this.inboxRepo.hasBeenProcessed(
      eventId,
      CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
    );
  }

  private buildEntries(
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
    customerId: string,
    expiryDays: number,
  ): LoyaltyEntry[] {
    return dto.lines.map((line) =>
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
  }

  private applyRedemption(
    balance: LoyaltyBalance,
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
    customerId: string,
    pointsRedeemed: number,
    pointsPerCurrencyUnit: number,
  ): LoyaltyRedemption | null {
    if (pointsRedeemed <= 0) return null;
    balance.decrement(pointsRedeemed);
    return LoyaltyRedemption.record({
      tenantId: dto.tenantId,
      customerId,
      pointsRedeemed,
      pointsPerCurrencyUnit,
      redeemedBy: dto.completedBy,
      bookingId: dto.bookingId,
    });
  }

  private buildServicePointsEarnedEvent(
    dto: CompleteBookingLoyaltyEffectsUseCaseInput,
    customerId: string,
    totalPointsEarned: number,
    entries: LoyaltyEntry[],
    currentBalance: number,
  ): ServicePointsEarned {
    return new ServicePointsEarned(dto.tenantId, dto.correlationId, {
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
      currentBalance,
    });
  }
}
