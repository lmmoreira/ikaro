'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';

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

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('rejectError'));
    }
  }

  return (
    <BookingActionSheetShell
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
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          rows={5}
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
