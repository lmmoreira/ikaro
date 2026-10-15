'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';

interface CancelSheetProps {
  readonly open: boolean;
  readonly count: number;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: { readonly reason?: string }) => Promise<void>;
}

export function CancelSheet({
  open,
  count,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: CancelSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const dialogRef = useModalDialog(open);
  const [reason, setReason] = useState('');

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit({ reason: reason.trim() || undefined });
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="scheduling-cancel-sheet-title"
      descriptionId="scheduling-cancel-sheet-description"
      title={t('cancelTitle', { count })}
      description={t('cancelDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('back')}
      submitLabel={t('cancelSubmit', { count })}
      submitVariant="destructive"
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
          maxLength={500}
          rows={3}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
        />
        <span className="mt-1 block text-xs text-gray-400">{t('reasonHelpCancel')}</span>
      </label>
    </BookingActionSheetShell>
  );
}
