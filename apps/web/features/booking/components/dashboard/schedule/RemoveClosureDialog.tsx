'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduleClosure } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface RemoveClosureDialogProps {
  readonly open: boolean;
  readonly target: ScheduleClosure | null;
  readonly onClose: () => void;
  readonly onSubmit: (id: string) => Promise<void>;
}

function getReasonLabel(t: (key: string) => string, reason: ScheduleClosure['reason']): string {
  if (reason === 'MAINTENANCE') return t('reasonMaintenance');
  if (reason === 'HOLIDAY') return t('reasonHoliday');
  return t('reasonDayOff');
}

export function RemoveClosureDialog({
  open,
  target,
  onClose,
  onSubmit,
}: RemoveClosureDialogProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const { formatDateLong } = useFormatting();
  const dialogRef = useModalDialog(open);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !target) return null;
  const closure = target;

  const dateLabel = formatDateLong(new Date(`${closure.date}T00:00:00Z`));
  const rangeLabel =
    closure.startTime && closure.endTime ? `${closure.startTime}–${closure.endTime}` : t('allDay');

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(closure.id);
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
      titleId="remove-closure-title"
      descriptionId="remove-closure-description"
      title={t('removeClosureTitle')}
      description={t('removeClosureDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={commonT('cancel')}
      submitLabel={t('submitRemoveClosure')}
      submitVariant="destructive"
      submitDisabled={isSubmitting}
      error={error}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900">{getReasonLabel(t, target.reason)}</p>
          <p className="mt-1 text-sm text-gray-600">{dateLabel}</p>
          <p className="mt-1 text-sm text-gray-600">{rangeLabel}</p>
          {target.notes ? (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                {t('notesLabel')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{target.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </BookingActionSheetShell>
  );
}
