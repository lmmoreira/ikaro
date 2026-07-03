'use client';

import type { ScheduleClosure } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { ScheduleRemovalDialog } from './ScheduleRemovalDialog';

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

  if (!open || !target) return null;

  return (
    <ScheduleRemovalDialog
      open={open}
      target={target}
      onClose={onClose}
      onSubmit={onSubmit}
      titleId="remove-closure-title"
      descriptionId="remove-closure-description"
      title={t('removeClosureTitle')}
      description={t('removeClosureDescription')}
      submitLabel={t('submitRemoveClosure')}
      submitVariant="destructive"
      summaryTitle={getReasonLabel(t, target.reason)}
      rangeLabel={
        target.startTime && target.endTime ? `${target.startTime}–${target.endTime}` : t('allDay')
      }
      notesLabel={t('notesLabel')}
    />
  );
}
