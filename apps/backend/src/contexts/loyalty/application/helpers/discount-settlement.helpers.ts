import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyRedemption } from '../../domain/loyalty-redemption.aggregate';
import { AppLogger } from '../../../../shared/observability/app-logger';

export interface DiscountSettlementSource {
  tenantId: string;
  eventId: string;
  bookingId: string;
  completedBy: string;
}

/**
 * Settles the points discount a booking was already completed with, for what the balance still
 * covers. The balance may have dropped since the completion screen loaded it (the expiry sweep, or
 * another completion for the same customer), so a discount larger than the balance is not an error:
 * the caller still records the earn and never retries. Returns the redemption for the points
 * actually taken, or null when no discount was used or nothing was covered
 * (`loyalty_redemptions.points_redeemed` must be positive).
 */
export function settleDiscount(
  balance: LoyaltyBalance,
  source: DiscountSettlementSource,
  customerId: string,
  pointsUsed: number,
  pointsPerCurrencyUnit: number,
): LoyaltyRedemption | null {
  if (pointsUsed <= 0) return null;
  const pointsRedeemed = balance.decrementUpTo(pointsUsed);
  if (pointsRedeemed === 0) return null;
  return LoyaltyRedemption.record({
    tenantId: source.tenantId,
    customerId,
    pointsRedeemed,
    pointsPerCurrencyUnit,
    redeemedBy: source.completedBy,
    bookingId: source.bookingId,
  });
}

/**
 * Logs the shortfall of a settlement that has already committed (never from inside the
 * transaction: a rolled-back attempt must not leave a warning, and its retry would log again).
 */
export function logDiscountShortfall(
  logger: AppLogger,
  source: DiscountSettlementSource,
  customerId: string,
  pointsUsed: number,
  pointsRedeemed: number,
): void {
  if (pointsRedeemed >= pointsUsed) return;
  logger.warn('Points discount exceeded the balance: settled what the balance covered', {
    tenantId: source.tenantId,
    customerId,
    bookingId: source.bookingId,
    eventId: source.eventId,
    pointsUsed,
    pointsRedeemed,
    pointsShortfall: pointsUsed - pointsRedeemed,
  });
}
