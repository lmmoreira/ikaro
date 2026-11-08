'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent, useId } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/sheets/BookingActionSheetShell';
import { Label } from '@/shared/components/ui/label';

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
  const fieldId = useId();
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const [reason, setReason] = useState('');

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit({ reason: reason.trim() || undefined });
  }

  return (
    <BookingActionSheetShell
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
      <div className="block">
        <Label htmlFor={fieldId}>
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
        </Label>
        <Textarea
          id={fieldId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
        />
        <span className="mt-1 block text-xs text-gray-400">{t('reasonHelpCancel')}</span>
      </div>
    </BookingActionSheetShell>
  );
}
