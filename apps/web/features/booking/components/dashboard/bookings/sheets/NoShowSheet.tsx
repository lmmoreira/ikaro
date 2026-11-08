'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent, useId } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import { NO_SHOW_REASON_MAX } from '@/features/booking/model/booking-no-show';
import { Label } from '@/shared/components/ui/label';

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
  const fieldId = useId();
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(reason.trim() || undefined);
    onClose();
  }

  return (
    <BookingActionSheetShell
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
      <div className="block">
        <Label htmlFor={fieldId}>
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
        </Label>
        <Textarea
          id={fieldId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={NO_SHOW_REASON_MAX}
          rows={4}
          placeholder={t('noShowReasonPlaceholder')}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{t('optional')}</span>
        <span>
          {reason.length} / {NO_SHOW_REASON_MAX}
        </span>
      </div>
    </BookingActionSheetShell>
  );
}
