'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { getBooking } from '@/features/booking/api/booking';
import { useCompleteBooking } from './useBookingMutations';

interface CompletionLine {
  readonly lineId: string;
  readonly actualPriceCharged: number;
}

function buildCompletionLines(
  lines: StaffBookingDetailResponse['lines'],
  linePrices: Record<string, string>,
  invalidPriceMessage: string,
): readonly CompletionLine[] {
  return lines.map((line) => {
    const rawValue = linePrices[line.lineId] ?? '';
    const value = Number(rawValue);
    if (rawValue.trim() === '' || !Number.isFinite(value) || value < 0) {
      throw new TypeError(invalidPriceMessage);
    }
    return { lineId: line.lineId, actualPriceCharged: value };
  });
}

interface UseMarkCompleteSubmissionParams {
  readonly booking: StaffBookingDetailResponse;
  readonly linePrices: Record<string, string>;
  readonly showLoyaltyPanel: boolean;
  readonly pointsUsed: number;
  readonly discountAmount: number;
  readonly loyaltyBalance: number;
  readonly totalEarnedPoints: number;
  readonly onCompletedStatus: () => void;
}

interface UseMarkCompleteSubmissionResult {
  readonly afterServicePhotoUrls: readonly string[];
  readonly setAfterServicePhotoUrls: (urls: readonly string[]) => void;
  readonly adminNotes: string;
  readonly setAdminNotes: (notes: string) => void;
  readonly error: string | null;
  readonly completed: boolean;
  readonly isSubmitting: boolean;
  readonly completedBooking: StaffBookingDetailResponse | null;
  readonly handleSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
}

export function computeCompletedBookingForDisplay(
  booking: StaffBookingDetailResponse,
  loyaltyBalance: number,
  totalEarnedPoints: number,
  pointsUsed: number,
  completedBooking: StaffBookingDetailResponse | null,
): StaffBookingDetailResponse {
  const bookingForDisplay = completedBooking ?? booking;
  if (bookingForDisplay.customerId === null) return bookingForDisplay;

  return {
    ...bookingForDisplay,
    loyaltyBalance: Math.max(0, loyaltyBalance + totalEarnedPoints - pointsUsed),
  };
}

function buildCompletionBody(
  lines: readonly CompletionLine[],
  afterServicePhotoUrls: readonly string[],
  adminNotes: string,
  showLoyaltyPanel: boolean,
  pointsUsed: number,
  discountAmount: number,
): {
  readonly lines: readonly CompletionLine[];
  readonly afterServicePhotoUrls?: readonly string[];
  readonly adminNotes?: string;
  readonly discountByPoints?: { readonly pointsUsed: number; readonly amountDeducted: number };
} {
  return {
    lines,
    ...(afterServicePhotoUrls.length > 0
      ? { afterServicePhotoUrls: [...afterServicePhotoUrls] }
      : {}),
    ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
    ...(showLoyaltyPanel && pointsUsed > 0
      ? { discountByPoints: { pointsUsed, amountDeducted: discountAmount } }
      : {}),
  };
}

interface SubmitCompletionRuntime {
  readonly params: UseMarkCompleteSubmissionParams;
  readonly translateInvalidPrice: () => string;
  readonly translateGenericError: () => string;
  readonly afterServicePhotoUrls: readonly string[];
  readonly adminNotes: string;
  readonly mutateAsync: ReturnType<typeof useCompleteBooking>['mutateAsync'];
  readonly setError: (message: string | null) => void;
  readonly setCompletedBooking: (booking: StaffBookingDetailResponse) => void;
  readonly setCompleted: (completed: boolean) => void;
}

async function submitCompletion(runtime: SubmitCompletionRuntime): Promise<void> {
  const { params } = runtime;
  runtime.setError(null);

  try {
    const lines = buildCompletionLines(
      params.booking.lines,
      params.linePrices,
      runtime.translateInvalidPrice(),
    );
    const body = buildCompletionBody(
      lines,
      runtime.afterServicePhotoUrls,
      runtime.adminNotes,
      params.showLoyaltyPanel,
      params.pointsUsed,
      params.discountAmount,
    );
    await runtime.mutateAsync({ id: params.booking.bookingId, body });
    const refreshedBooking = await getBooking(params.booking.bookingId);
    runtime.setCompletedBooking(refreshedBooking);
    params.onCompletedStatus();
    runtime.setCompleted(true);
  } catch (err) {
    const invalidPriceMessage = runtime.translateInvalidPrice();
    runtime.setError(
      err instanceof Error && err.message === invalidPriceMessage
        ? err.message
        : runtime.translateGenericError(),
    );
  }
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the completion submission flow (line-price
// validation, the mutate call, and the status/error state it drives) is a self-contained
// concern, unrelated to loyalty-redemption math or field rendering.
export function useMarkCompleteSubmission(
  params: UseMarkCompleteSubmissionParams,
): UseMarkCompleteSubmissionResult {
  const t = useTranslations('dashboard.bookingDetail');
  const completeBookingMutation = useCompleteBooking();
  const [afterServicePhotoUrls, setAfterServicePhotoUrls] = useState<readonly string[]>(() => [
    ...params.booking.afterServicePhotoUrls,
  ]);
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<StaffBookingDetailResponse | null>(null);

  const runtime: SubmitCompletionRuntime = {
    params,
    translateInvalidPrice: () => t('completeInvalidPrice'),
    translateGenericError: () => t('completeError'),
    afterServicePhotoUrls,
    adminNotes,
    mutateAsync: completeBookingMutation.mutateAsync,
    setError,
    setCompletedBooking,
    setCompleted,
  };

  function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    return submitCompletion(runtime);
  }

  return {
    afterServicePhotoUrls,
    setAfterServicePhotoUrls,
    adminNotes,
    setAdminNotes,
    error,
    completed,
    isSubmitting: completeBookingMutation.isPending,
    completedBooking,
    handleSubmit,
  };
}
