'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { useModalDialog } from './use-modal-dialog';

interface RejectBookingSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => Promise<void>;
}

export function RejectBookingSheet({
  open,
  isSubmitting,
  onClose,
  onSubmit,
}: RejectBookingSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog(open, onClose);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = reason.trim();
    if (!value) {
      setError(t('required'));
      return;
    }

    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch {
      setError(t('rejectError'));
    }
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="reject-sheet-title"
      descriptionId="reject-sheet-description"
      title={t('rejectSheetTitle')}
      description={t('rejectSheetDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitReject')}
      submitDisabled={isSubmitting || !reason.trim()}
      error={error}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-gray-700">{t('reasonLabel')}</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          rows={5}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          placeholder={t('rejectPlaceholder')}
        />
      </label>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{reason.trim().length > 0 ? t('readyToSend') : t('required')}</span>
        <span>{reason.trim().length} / 200</span>
      </div>
    </BookingActionSheetShell>
  );
}
