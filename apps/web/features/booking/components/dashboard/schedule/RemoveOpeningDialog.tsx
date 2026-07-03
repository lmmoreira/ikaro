'use client';

import type { ScheduleOpening } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { ScheduleRemovalDialog } from './ScheduleRemovalDialog';

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

  if (!open || !target) return null;

  return (
    <ScheduleRemovalDialog
      open={open}
      target={target}
      onClose={onClose}
      onSubmit={onSubmit}
      titleId="remove-opening-title"
      descriptionId="remove-opening-description"
      title={t('removeOpeningTitle')}
      description={t('removeOpeningDescription')}
      submitLabel={t('submitRemoveOpening')}
      submitVariant="destructive"
      rangeLabel={`${target.startTime}–${target.endTime}`}
      notesLabel={t('notesLabel')}
    />
  );
}
