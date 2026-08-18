'use client';

import { useTranslations } from 'next-intl';
import type { ValidationProblemDetail } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import {
  useCancelBooking,
  useRejectBooking,
  useRequestMoreInfo,
} from '@/features/booking/hooks/useBookingMutations';
import { AdminCancelBookingSheet } from './AdminCancelBookingSheet';
import { RejectBookingSheet } from './RejectBookingSheet';
import { RequestInfoSheet } from './RequestInfoSheet';

export type BookingDetailSheetState = 'reject' | 'info' | 'cancel' | null;

function extractValidationMessage(
  err: unknown,
  field: string,
  locale: SupportedLocale,
): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const data = err.data as ValidationProblemDetail | undefined;
  const violation = data?.violations?.find((item) => item.field === field);
  return violation ? resolveErrorMessage(violation.code, locale, violation.params) : null;
}

interface BookingDetailSheetsProps {
  readonly bookingId: string;
  readonly sheetState: BookingDetailSheetState;
  readonly isSubmitting: boolean;
  readonly locale: SupportedLocale;
  readonly onClose: () => void;
  readonly onSubmittingStart: () => void;
  readonly onRejected: (reason: string) => void;
  readonly onInfoRequested: (message: string) => void;
  readonly onCancelled: (reason?: string) => void;
  readonly onSettleError: (message: string, isValidationError: boolean) => void;
}

// Extracted from BookingDetailPage (TD37-S5A) — the 3 admin action sheets and their submit/
// validation-error routing are a self-contained concern, unrelated to the main banner or aside
// card around them.
export function BookingDetailSheets({
  bookingId,
  sheetState,
  isSubmitting,
  locale,
  onClose,
  onSubmittingStart,
  onRejected,
  onInfoRequested,
  onCancelled,
  onSettleError,
}: BookingDetailSheetsProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const rejectBookingMutation = useRejectBooking();
  const requestMoreInfoMutation = useRequestMoreInfo();
  const cancelBookingMutation = useCancelBooking();

  return (
    <>
      {sheetState === 'reject' && (
        <RejectBookingSheet
          open
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={async (reason) => {
            onSubmittingStart();
            try {
              await rejectBookingMutation.mutateAsync({ id: bookingId, body: { reason } });
              onRejected(reason);
            } catch (err) {
              const validationMessage = extractValidationMessage(err, 'reason', locale);
              const message = validationMessage ?? t('rejectError');
              onSettleError(message, validationMessage !== null);
              throw new Error(message);
            }
          }}
        />
      )}

      {sheetState === 'info' && (
        <RequestInfoSheet
          open
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={async (message) => {
            onSubmittingStart();
            try {
              await requestMoreInfoMutation.mutateAsync({ id: bookingId, body: { message } });
              onInfoRequested(message);
            } catch (err) {
              const validationMessage = extractValidationMessage(err, 'message', locale);
              const errorMessage = validationMessage ?? t('requestInfoError');
              onSettleError(errorMessage, validationMessage !== null);
              throw new Error(errorMessage);
            }
          }}
        />
      )}

      {sheetState === 'cancel' && (
        <AdminCancelBookingSheet
          open
          isSubmitting={isSubmitting}
          onClose={onClose}
          onSubmit={async (reason) => {
            onSubmittingStart();
            try {
              await cancelBookingMutation.mutateAsync({
                id: bookingId,
                ...(reason ? { body: { reason } } : {}),
              });
              onCancelled(reason);
            } catch {
              onSettleError(t('cancelError'), false);
              throw new Error(t('cancelError'));
            }
          }}
        />
      )}
    </>
  );
}
