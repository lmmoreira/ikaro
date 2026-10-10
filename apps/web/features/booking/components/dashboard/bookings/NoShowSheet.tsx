'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { NO_SHOW_REASON_MAX } from '@/features/booking/model/booking-no-show';

interface NoShowSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly contactName: string;
  readonly onClose: () => void;
  // Resolves once the outcome is settled — a failure is shown by the page as a banner, so the
  // handler does not throw for it and the sheet closes either way.
  readonly onSubmit: (reason?: string) => Promise<void>;
}

// UC-074 (03-booking-detail-approved.html) — an optional, internal reason. It is never shown to the
// customer, in the email or on their booking detail.
export function NoShowSheet({
  open,
  isSubmitting,
  contactName,
  onClose,
  onSubmit,
}: NoShowSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');
  const dialogRef = useModalDialog(open);

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(reason.trim() || undefined);
    onClose();
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="no-show-sheet-title"
      descriptionId="no-show-sheet-description"
      title={t('noShowSheetTitle')}
      description={
        <>
          {t('noShowSheetDescription', { name: contactName })}
          <span className="mt-1 block">{t('noShowSheetNote')}</span>
        </>
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitNoShow')}
      submitDisabled={isSubmitting}
      error={null}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-gray-700">
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={NO_SHOW_REASON_MAX}
          rows={4}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          placeholder={t('noShowReasonPlaceholder')}
        />
      </label>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{t('optional')}</span>
        <span>
          {reason.length} / {NO_SHOW_REASON_MAX}
        </span>
      </div>
    </BookingActionSheetShell>
  );
}
