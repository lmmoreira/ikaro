'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { useModalDialog } from './use-modal-dialog';

interface RequestInfoSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (message: string) => Promise<void>;
}

export function RequestInfoSheet({
  open,
  isSubmitting,
  onClose,
  onSubmit,
}: RequestInfoSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog(open);

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) {
      setError(t('required'));
      return;
    }

    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch {
      setError(t('requestInfoError'));
    }
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="request-info-sheet-title"
      descriptionId="request-info-sheet-description"
      title={t('requestSheetTitle')}
      description={t('requestSheetDescription', { status: t('statusPending') })}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitRequestInfo')}
      submitDisabled={isSubmitting || !message.trim()}
      error={error}
    >
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-gray-700">{t('questionLabel')}</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={200}
          rows={5}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
          placeholder={t('requestPlaceholder')}
        />
      </label>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{message.trim().length > 0 ? t('readyToSend') : t('required')}</span>
        <span>{message.trim().length} / 200</span>
      </div>
    </BookingActionSheetShell>
  );
}
