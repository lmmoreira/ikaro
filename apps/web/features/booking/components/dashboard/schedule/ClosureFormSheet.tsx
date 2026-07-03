'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ClosureReason, CreateClosureRequest, ScheduleClosure } from '@ikaro/types';
import { ScheduleDateTimeRangeSheet } from './ScheduleDateTimeRangeSheet';

interface ClosureFormSheetProps {
  readonly open: boolean;
  readonly initialDate: string;
  readonly todayKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly onClose: () => void;
  readonly onSubmit: (body: CreateClosureRequest) => Promise<ScheduleClosure>;
}

function getClosureReasonOptions(
  t: (key: string) => string,
): Array<{ value: ClosureReason; label: string }> {
  return [
    { value: 'STAFF_DAY_OFF', label: t('reasonDayOff') },
    { value: 'MAINTENANCE', label: t('reasonMaintenance') },
    { value: 'HOLIDAY', label: t('reasonHoliday') },
  ];
}

export function ClosureFormSheet({
  open,
  initialDate,
  todayKey,
  timezone,
  slotGranularityMinutes,
  onClose,
  onSubmit,
}: ClosureFormSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const [reason, setReason] = useState<ClosureReason>('STAFF_DAY_OFF');
  const reasonOptions = getClosureReasonOptions(t);

  return (
    <ScheduleDateTimeRangeSheet<CreateClosureRequest, ScheduleClosure>
      open={open}
      initialDate={initialDate}
      timezone={timezone}
      slotGranularityMinutes={slotGranularityMinutes}
      onClose={onClose}
      onSubmit={onSubmit}
      titleId="closure-sheet-title"
      descriptionId="closure-sheet-description"
      title={t('closureFormTitle')}
      cancelLabel={commonT('cancel')}
      submitLabel={t('submitBlock')}
      dateLabel={t('dateLabel')}
      startTimeLabel={t('startTimeLabel')}
      endTimeLabel={t('endTimeLabel')}
      notesLabel={t('notesLabel')}
      timePlaceholder={t('timePlaceholder')}
      fullDayHint={t('fullDayHint')}
      validate={({ date, startTime, endTime }) => {
        if (!date) return t('errors.requiredDate');
        if (date < todayKey) return t('errors.pastDateClosure');
        if (!reason) return t('errors.requiredReason');
        if ((startTime && !endTime) || (!startTime && endTime)) return t('errors.closureTimePair');
        if (startTime && endTime && startTime >= endTime) return t('errors.closureTimeRange');
        return null;
      }}
      buildRequest={({ date, startTime, endTime, notes }) => ({
        date,
        reason,
        ...(startTime && endTime ? { startTime, endTime } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })}
    >
      <label className="block space-y-2">
        <span className="block text-sm font-medium text-gray-700">{t('reasonLabel')}</span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as ClosureReason)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          {reasonOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </ScheduleDateTimeRangeSheet>
  );
}
