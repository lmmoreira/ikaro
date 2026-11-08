'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useState, type SubmitEvent, useId } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from './BookingActionSheetShell';
import {
  isCorrectionReasonValid,
  NO_SHOW_REASON_MAX,
} from '@/features/booking/model/booking-no-show';
import { Label } from '@/shared/components/ui/label';

interface CorrectNoShowSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly contactName: string;
  // Loyalty points the correction awards; null for a guest booking (no loyalty account).
  readonly points: number | null;
  readonly services: string;
  readonly onClose: () => void;
  // Resolves once the outcome is settled — a failure is shown by the page as a banner, so the
  // handler does not throw for it and the sheet closes either way.
  readonly onSubmit: (reason: string) => Promise<void>;
}

// UC-074 A3 (03g-correct-no-show.html) — manager only. The reason is required, trimmed, 10–500
// characters: it is the audit trail for the correction.
export function CorrectNoShowSheet({
  open,
  isSubmitting,
  contactName,
  points,
  services,
  onClose,
  onSubmit,
}: CorrectNoShowSheetProps): React.JSX.Element | null {
  const fieldId = useId();
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');

  if (!open) return null;

  const isValid = isCorrectionReasonValid(reason);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    await onSubmit(reason.trim());
    onClose();
  }

  return (
    <BookingActionSheetShell
      title={t('correctSheetTitle')}
      description={
        points === null
          ? t('correctSheetDescription', { name: contactName })
          : t('correctSheetDescriptionPoints', { name: contactName, points, services })
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('cancel')}
      submitLabel={t('submitCorrect')}
      submitDisabled={isSubmitting || !isValid}
      error={null}
    >
      <div className="block">
        <Label htmlFor={fieldId}>
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('required')})</span>
        </Label>
        <Textarea
          id={fieldId}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={NO_SHOW_REASON_MAX}
          rows={4}
          placeholder={t('correctReasonPlaceholder')}
        />
      </div>

      <div className="mt-2 text-xs text-gray-400">
        {t('correctReasonCounter', { count: reason.trim().length })}
      </div>
    </BookingActionSheetShell>
  );
}
