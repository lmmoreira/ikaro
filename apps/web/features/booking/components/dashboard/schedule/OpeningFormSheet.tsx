'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CreateOpeningRequest, ScheduleOpening } from '@ikaro/types';
import { useTenant } from '@/providers/tenant-provider';
import { ResourceSelectField } from './ResourceSelectField';
import { ScheduleDateTimeRangeSheet } from './ScheduleDateTimeRangeSheet';

interface OpeningFormSheetProps {
  readonly open: boolean;
  readonly initialDate: string;
  readonly todayKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly onClose: () => void;
  readonly onSubmit: (body: CreateOpeningRequest) => Promise<ScheduleOpening>;
}

export function OpeningFormSheet({
  open,
  initialDate,
  todayKey,
  timezone,
  slotGranularityMinutes,
  onClose,
  onSubmit,
}: OpeningFormSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const { role } = useTenant();
  // Always starts fresh at "Todo o negócio" — see ClosureFormSheet's identical field for why
  // this is deliberately decoupled from ResourceFilterMenu's own multi-select view filter.
  const [resourceId, setResourceId] = useState<string | null>(null);

  return (
    <ScheduleDateTimeRangeSheet<CreateOpeningRequest, ScheduleOpening>
      open={open}
      initialDate={initialDate}
      timezone={timezone}
      slotGranularityMinutes={slotGranularityMinutes}
      onClose={onClose}
      onSubmit={onSubmit}
      titleId="opening-sheet-title"
      descriptionId="opening-sheet-description"
      title={t('openingFormTitle')}
      description={t('openingFormDescription')}
      cancelLabel={commonT('cancel')}
      submitLabel={t('submitOpen')}
      dateLabel={t('dateLabel')}
      startTimeLabel={t('startTimeLabel')}
      endTimeLabel={t('endTimeLabel')}
      notesLabel={t('notesLabel')}
      timePlaceholder={t('timePlaceholder')}
      validate={({ date, startTime, endTime }) => {
        if (!date) return t('errors.requiredDate');
        if (date < todayKey) return t('errors.pastDateOpening');
        if (!startTime || !endTime) return t('errors.openingTimePair');
        if (startTime >= endTime) return t('errors.openingTimeRange');
        return null;
      }}
      buildRequest={({ date, startTime, endTime, notes }) => ({
        date,
        startTime,
        endTime,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(resourceId ? { resourceId } : {}),
      })}
    >
      {role === 'MANAGER' && (
        <ResourceSelectField value={resourceId} onValueChange={setResourceId} />
      )}
    </ScheduleDateTimeRangeSheet>
  );
}
