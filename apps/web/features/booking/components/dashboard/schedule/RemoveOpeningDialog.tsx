'use client';

import type { SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduleOpening } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { ScheduleRemovalSummary } from './ScheduleRemovalSummary';
import { useConfirmRemoval } from './use-confirm-removal';

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
  const { dialogRef, isSubmitting, error, confirmRemoval } = useConfirmRemoval({
    open,
    onClose,
    onSubmit,
    getErrorMessage: (err) =>
      err instanceof ApiError && err.detail ? err.detail : t('errors.submitFailed'),
  });

  if (!open || !target) return null;
  const opening = target;

  const dateLabel = formatDateLong(new Date(`${opening.date}T00:00:00Z`));
  const rangeLabel = `${opening.startTime}–${opening.endTime}`;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await confirmRemoval(opening.id);
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
      <ScheduleRemovalSummary
        dateLabel={dateLabel}
        rangeLabel={rangeLabel}
        notesLabel={t('notesLabel')}
        notes={opening.notes}
      />
    </BookingActionSheetShell>
  );
}
