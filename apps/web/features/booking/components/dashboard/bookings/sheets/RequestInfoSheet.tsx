'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent, useId } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { Label } from '@/shared/components/ui/label';

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
  const fieldId = useId();
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
      <div className="block">
        <Label htmlFor={fieldId}>{t('questionLabel')}</Label>
        <Textarea
          id={fieldId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={200}
          rows={5}
          placeholder={t('requestPlaceholder')}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{message.trim().length > 0 ? t('readyToSend') : t('required')}</span>
        <span>{message.trim().length} / 200</span>
      </div>
    </BookingActionSheetShell>
  );
}
