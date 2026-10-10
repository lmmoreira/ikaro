'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import {
  isCorrectionReasonValid,
  NO_SHOW_REASON_MAX,
} from '@/features/booking/model/booking-no-show';

interface CorrectNoShowSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly contactName: string;
  // Loyalty points the correction awards; null for a guest booking (no loyalty account).
  readonly points: number | null;
  readonly services: string;
  readonly onClose: () => void;
  // Resolves once the outcome is settled — a failure is shown by the page as a banner, so the
  // handler does not throw for it and the sheet closes either way.
  readonly onSubmit: (reason: string) => Promise<void>;
}

// UC-074 A3 (03g-correct-no-show.html) — manager only. The reason is required, trimmed, 10–500
// characters: it is the audit trail for the correction.
export function CorrectNoShowSheet({
  open,
  isSubmitting,
  contactName,
  points,
  services,
  onClose,
  onSubmit,
}: CorrectNoShowSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');
  const dialogRef = useModalDialog(open);

  if (!open) return null;

  const isValid = isCorrectionReasonValid(reason);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    await onSubmit(reason.trim());
    onClose();
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="correct-no-show-sheet-title"
      descriptionId="correct-no-show-sheet-description"
      title={t('correctSheetTitle')}
      description={
        points === null
          ? t('correctSheetDescription', { name: contactName })
          : t('correctSheetDescriptionPoints', { name: contactName, points, services })
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitCorrect')}
      submitDisabled={isSubmitting || !isValid}
      error={null}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-gray-700">
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('required')})</span>
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={NO_SHOW_REASON_MAX}
          rows={4}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          placeholder={t('correctReasonPlaceholder')}
        />
      </label>

      <div className="mt-2 text-xs text-gray-400">
        {t('correctReasonCounter', { count: reason.trim().length })}
      </div>
    </BookingActionSheetShell>
  );
}
