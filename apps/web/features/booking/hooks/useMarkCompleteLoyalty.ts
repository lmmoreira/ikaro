'use client';

import { useMemo, useState } from 'react';
import type { StaffBookingDetailResponse } from '@ikaro/types';

function calculateTotalCharged(
  lines: StaffBookingDetailResponse['lines'],
  linePrices: Record<string, string>,
): number {
  return lines.reduce((sum, line) => {
    const value = Number(linePrices[line.lineId]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

function calculateMaxRedeemablePoints(
  showLoyaltyPanel: boolean,
  totalCharged: number,
  loyaltyPointsPerCurrencyUnit: number,
  loyaltyBalance: number,
): number {
  if (!showLoyaltyPanel) return 0;

  const maxByTotal = Math.floor(totalCharged) * loyaltyPointsPerCurrencyUnit;
  const cappedPoints = Math.max(0, Math.min(loyaltyBalance, maxByTotal));
  return Math.floor(cappedPoints / loyaltyPointsPerCurrencyUnit) * loyaltyPointsPerCurrencyUnit;
}

function calculateTotalEarnedPoints(lines: StaffBookingDetailResponse['lines']): number {
  return lines.reduce((sum, line) => sum + line.pointsValueAtBooking, 0);
}

function normalizePointsInput(
  value: string,
  loyaltyPointsPerCurrencyUnit: number,
  maxRedeemablePoints: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  const normalized =
    Math.floor(parsed / loyaltyPointsPerCurrencyUnit) * loyaltyPointsPerCurrencyUnit;
  return Math.min(normalized, maxRedeemablePoints);
}

interface DerivedLoyaltyState {
  readonly loyaltyBalance: number;
  readonly loyaltyPointsPerCurrencyUnit: number;
  readonly showLoyaltyPanel: boolean;
  readonly totalCharged: number;
  readonly maxRedeemablePoints: number;
  readonly totalEarnedPoints: number;
  readonly pointsUsed: number;
  readonly discountAmount: number;
  readonly finalChargedTotal: number;
}

function deriveLoyaltyState(
  booking: StaffBookingDetailResponse,
  pointsPerCurrencyUnit: number,
  linePrices: Record<string, string>,
  rawPointsUsed: number,
): DerivedLoyaltyState {
  const loyaltyPointsPerCurrencyUnit = Math.max(0, pointsPerCurrencyUnit);
  const loyaltyBalance = booking.loyaltyBalance ?? 0;
  const showLoyaltyPanel = booking.customerId !== null && loyaltyPointsPerCurrencyUnit > 0;
  const totalCharged = calculateTotalCharged(booking.lines, linePrices);
  const maxRedeemablePoints = calculateMaxRedeemablePoints(
    showLoyaltyPanel,
    totalCharged,
    loyaltyPointsPerCurrencyUnit,
    loyaltyBalance,
  );
  const totalEarnedPoints = calculateTotalEarnedPoints(booking.lines);
  const pointsUsed = Math.min(rawPointsUsed, maxRedeemablePoints);
  const discountAmount = showLoyaltyPanel ? pointsUsed / loyaltyPointsPerCurrencyUnit : 0;
  const finalChargedTotal = Math.max(0, totalCharged - discountAmount);

  return {
    loyaltyBalance,
    loyaltyPointsPerCurrencyUnit,
    showLoyaltyPanel,
    totalCharged,
    maxRedeemablePoints,
    totalEarnedPoints,
    pointsUsed,
    discountAmount,
    finalChargedTotal,
  };
}

interface UseMarkCompleteLoyaltyResult {
  readonly linePrices: Record<string, string>;
  readonly onLinePriceChange: (lineId: string, value: string) => void;
  readonly loyaltyBalance: number;
  readonly loyaltyPointsPerCurrencyUnit: number;
  readonly showLoyaltyPanel: boolean;
  readonly totalCharged: number;
  readonly maxRedeemablePoints: number;
  readonly totalEarnedPoints: number;
  readonly pointsUsed: number;
  readonly discountAmount: number;
  readonly finalChargedTotal: number;
  readonly onPointsChange: (value: string) => void;
  readonly onUseAllPoints: () => void;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — per-line actual-price entry and
// loyalty-point redemption math are a self-contained concern, unrelated to submission or the
// success-view rendering.
export function useMarkCompleteLoyalty(
  booking: StaffBookingDetailResponse,
  pointsPerCurrencyUnit: number,
): UseMarkCompleteLoyaltyResult {
  const [linePrices, setLinePrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      booking.lines.map((line) => [line.lineId, String(line.priceAtBooking.amount)]),
    ),
  );
  const [rawPointsUsed, setRawPointsUsed] = useState(0);

  const derived = useMemo(
    () => deriveLoyaltyState(booking, pointsPerCurrencyUnit, linePrices, rawPointsUsed),
    [booking, pointsPerCurrencyUnit, linePrices, rawPointsUsed],
  );
  const { showLoyaltyPanel, loyaltyPointsPerCurrencyUnit, maxRedeemablePoints } = derived;

  return {
    ...derived,
    linePrices,
    onLinePriceChange: (lineId, value) =>
      setLinePrices((current) => ({ ...current, [lineId]: value })),
    onPointsChange: (value) => {
      if (!showLoyaltyPanel) return;
      setRawPointsUsed(
        normalizePointsInput(value, loyaltyPointsPerCurrencyUnit, maxRedeemablePoints),
      );
    },
    onUseAllPoints: () => {
      if (!showLoyaltyPanel) return;
      setRawPointsUsed(maxRedeemablePoints);
    },
  };
}
