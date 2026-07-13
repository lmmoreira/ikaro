'use client';

import type { ReactNode, SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { ScheduleRemovalSummary } from './ScheduleRemovalSummary';
import { useConfirmRemoval } from './use-confirm-removal';

export interface ScheduleRemovalTarget {
  readonly id: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly notes?: string | null;
}

interface ScheduleRemovalDialogProps {
  readonly open: boolean;
  readonly target: ScheduleRemovalTarget | null;
  readonly onClose: () => void;
  readonly onSubmit: (id: string) => Promise<void>;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly submitLabel: string;
  readonly submitVariant?: 'default' | 'destructive';
  readonly summaryTitle?: ReactNode;
  readonly rangeLabel: string;
  readonly notesLabel: string;
}

export function ScheduleRemovalDialog({
  open,
  target,
  onClose,
  onSubmit,
  titleId,
  descriptionId,
  title,
  description,
  submitLabel,
  submitVariant = 'default',
  summaryTitle,
  rangeLabel,
  notesLabel,
}: ScheduleRemovalDialogProps): React.JSX.Element | null {
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const { formatDateLong } = useFormatting();
  const { dialogRef, isSubmitting, error, confirmRemoval } = useConfirmRemoval({
    open,
    onClose,
    onSubmit,
    getErrorMessage: (err) => resolveErrorMessageFromApiError(err, locale),
  });

  if (!open || !target) return null;

  const removalTarget = target;
  const dateLabel = formatDateLong(new Date(`${target.date}T00:00:00Z`));

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await confirmRemoval(removalTarget.id);
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId={titleId}
      descriptionId={descriptionId}
      title={title}
      description={description}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={commonT('cancel')}
      submitLabel={submitLabel}
      submitVariant={submitVariant}
      submitDisabled={isSubmitting}
      error={error}
    >
      <ScheduleRemovalSummary
        title={summaryTitle}
        dateLabel={dateLabel}
        rangeLabel={rangeLabel}
        notesLabel={notesLabel}
        notes={removalTarget.notes}
      />
    </BookingActionSheetShell>
  );
}
