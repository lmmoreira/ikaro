import { CustomerLoyaltyEntryResponse, CustomerLoyaltyRedemptionResponse } from '@ikaro/types';
import { LoyaltyEntryItem, LoyaltyRedemptionItem } from './loyalty.types';

function formatBRL(amount: number): string {
  return `R$ ${amount.toFixed(2).replace('.', ',')}`;
}

export function toCustomerLoyaltyEntry(item: LoyaltyEntryItem): CustomerLoyaltyEntryResponse {
  return {
    entryId: item.entryId,
    serviceName: item.serviceName,
    pointsEarned: item.points,
    earnedAt: item.earnedAt,
    expiresAt: item.expiresAt,
    expired: !item.isActive,
  };
}

export function toCustomerLoyaltyRedemption(
  item: LoyaltyRedemptionItem,
  conversionRate: number,
): CustomerLoyaltyRedemptionResponse {
  const amountSaved = conversionRate > 0 ? item.pointsRedeemed / conversionRate : 0;
  return {
    redemptionId: item.redemptionId,
    pointsUsed: item.pointsRedeemed,
    amountSaved: formatBRL(amountSaved),
    redeemedAt: item.redeemedAt,
    bookingReference:
      item.bookingServices.length > 0
        ? item.bookingServices.map((s) => s.serviceName).join(', ')
        : null,
  };
}
