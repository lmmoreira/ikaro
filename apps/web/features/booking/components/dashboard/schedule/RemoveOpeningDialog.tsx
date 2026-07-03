'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduleOpening } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface RemoveOpeningDialogProps {
  readonly open: boolean;
  readonly target: ScheduleOpening | null;
  readonly onClose: () => void;
  readonly onSubmit: (id: string) => Promise<void>;
}

export function RemoveOpeningDialog({
  open,
  target,
  onClose,
  onSubmit,
}: RemoveOpeningDialogProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const { formatDateLong } = useFormatting();
  const dialogRef = useModalDialog(open);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !target) return null;
  const opening = target;

  const dateLabel = formatDateLong(new Date(`${opening.date}T00:00:00Z`));
  const rangeLabel = `${opening.startTime}–${opening.endTime}`;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(opening.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.detail ? err.detail : t('errors.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="remove-opening-title"
      descriptionId="remove-opening-description"
      title={t('removeOpeningTitle')}
      description={t('removeOpeningDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={commonT('cancel')}
      submitLabel={t('submitRemoveOpening')}
      submitVariant="destructive"
      submitDisabled={isSubmitting}
      error={error}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">{dateLabel}</p>
          <p className="mt-1 text-sm text-gray-600">{rangeLabel}</p>
          {opening.notes ? (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                {t('notesLabel')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{opening.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </BookingActionSheetShell>
  );
}
