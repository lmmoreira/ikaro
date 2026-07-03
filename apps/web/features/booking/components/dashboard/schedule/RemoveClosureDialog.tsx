'use client';

import type { SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduleClosure } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { ScheduleRemovalSummary } from './ScheduleRemovalSummary';
import { useConfirmRemoval } from './use-confirm-removal';

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
  const { dialogRef, isSubmitting, error, confirmRemoval } = useConfirmRemoval({
    open,
    onClose,
    onSubmit,
    getErrorMessage: (err) =>
      err instanceof ApiError && err.detail ? err.detail : t('errors.submitFailed'),
  });

  if (!open || !target) return null;
  const closure = target;

  const dateLabel = formatDateLong(new Date(`${closure.date}T00:00:00Z`));
  const rangeLabel =
    closure.startTime && closure.endTime ? `${closure.startTime}–${closure.endTime}` : t('allDay');

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await confirmRemoval(closure.id);
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
      <ScheduleRemovalSummary
        title={getReasonLabel(t, target.reason)}
        dateLabel={dateLabel}
        rangeLabel={rangeLabel}
        notesLabel={t('notesLabel')}
        notes={target.notes}
      />
    </BookingActionSheetShell>
  );
}
