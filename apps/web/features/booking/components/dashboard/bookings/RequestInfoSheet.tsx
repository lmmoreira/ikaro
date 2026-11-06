'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requestInfoError'));
    }
  }

  return (
    <BookingActionSheetShell
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
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={200}
          rows={5}
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
