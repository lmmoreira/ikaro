import {
  CustomerLoyaltyEntryResponse,
  CustomerLoyaltyRedemptionResponse,
  LoyaltyEntryItem as StaffLoyaltyEntryItem,
  LoyaltyRedemptionItem as StaffLoyaltyRedemptionItem,
} from '@ikaro/types';
import { BackendLoyaltyEntryItem, BackendLoyaltyRedemptionItem } from './loyalty.types';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatBRL(amount: number): string {
  return BRL_FORMATTER.format(amount);
}

function computeAmountDeducted(pointsRedeemed: number, pointsPerCurrencyUnit: number): number {
  return pointsPerCurrencyUnit > 0 ? pointsRedeemed / pointsPerCurrencyUnit : 0;
}

export function toCustomerLoyaltyEntry(
  item: BackendLoyaltyEntryItem,
): CustomerLoyaltyEntryResponse {
  return {
    entryId: item.entryId,
    bookingId: item.bookingId,
    serviceName: item.serviceName,
    pointsEarned: item.points,
    earnedAt: item.earnedAt,
    expiresAt: item.expiresAt,
    expired: !item.isActive,
  };
}

export function toCustomerLoyaltyRedemption(
  item: BackendLoyaltyRedemptionItem,
): CustomerLoyaltyRedemptionResponse {
  const amountSaved = computeAmountDeducted(item.pointsRedeemed, item.pointsPerCurrencyUnit);
  return {
    redemptionId: item.redemptionId,
    bookingId: item.bookingId,
    pointsUsed: item.pointsRedeemed,
    amountSaved: formatBRL(amountSaved),
    redeemedAt: item.redeemedAt,
    bookingReference:
      item.bookingServices.length > 0
        ? item.bookingServices.map((s) => s.serviceName).join(', ')
        : null,
  };
}

export function toStaffLoyaltyEntry(item: BackendLoyaltyEntryItem): StaffLoyaltyEntryItem {
  return {
    id: item.entryId,
    bookingId: item.bookingId,
    serviceName: item.serviceName,
    points: item.points,
    earnedAt: item.earnedAt,
    expiresAt: item.expiresAt,
    isActive: item.isActive,
  };
}

export function toStaffLoyaltyRedemption(
  item: BackendLoyaltyRedemptionItem,
): StaffLoyaltyRedemptionItem {
  return {
    id: item.redemptionId,
    pointsRedeemed: item.pointsRedeemed,
    amountDeducted: computeAmountDeducted(item.pointsRedeemed, item.pointsPerCurrencyUnit),
    redeemedAt: item.redeemedAt,
    bookingId: item.bookingId,
    notes: item.notes,
  };
}
