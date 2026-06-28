'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { useModalDialog } from './use-modal-dialog';

interface AdminCancelBookingSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason?: string) => Promise<void>;
}

export function AdminCancelBookingSheet({
  open,
  isSubmitting,
  onClose,
  onSubmit,
}: AdminCancelBookingSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog(open, onClose);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(reason.trim() || undefined);
      onClose();
    } catch {
      setError(t('cancelError'));
    }
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="cancel-sheet-title"
      descriptionId="cancel-sheet-description"
      title={t('cancelSheetTitle')}
      description={t('cancelSheetDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitCancel')}
      submitDisabled={isSubmitting}
      error={error}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-gray-700">
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          rows={5}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          placeholder={t('cancelPlaceholder')}
        />
      </label>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{t('optional')}</span>
        <span>{reason.trim().length} / 200</span>
      </div>
    </BookingActionSheetShell>
  );
}
