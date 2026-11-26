'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { WeekDayRow } from '@/shared/components/ui/week-day-row';
import { WEEK_DAYS, type DayHoursValue, type WeekDay } from '@/features/platform/settings-form';
import { ReadOnlyField } from './SettingsFormFields';

interface SettingsHoursSectionProps {
  // The tenant's stored zone, shown read-only: it is set at signup and only an operator corrects
  // it, so it is not part of the form's values and a save never sends it.
  readonly timezone: string;
  readonly days: Record<WeekDay, DayHoursValue>;
  readonly timeFormat: '24h' | '12h';
  readonly onDayChange: (day: WeekDay, patch: Partial<DayHoursValue>) => void;
  readonly onCopyMondayToWeekdays: () => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Business hours" section (the read-only timezone +
// the 7-day hours grid) is a self-contained, cohesive group, unrelated to the other SectionCard groups
// around it.
export function SettingsHoursSection({
  timezone,
  days,
  timeFormat,
  onDayChange,
  onCopyMondayToWeekdays,
}: SettingsHoursSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard size="compact" title={t('sections.hours')}>
      <div>
        <ReadOnlyField
          testId="settings-timezone"
          label={t('timezoneLabel')}
          value={timezone === 'America/Sao_Paulo' ? t('timezoneBrasilia') : timezone}
        />
        <p className="mt-1.5 text-sm text-gray-500">{t('timezoneHint')}</p>
      </div>
      <div>
        {WEEK_DAYS.map((day) => (
          <WeekDayRow
            key={day}
            day={day}
            label={t(`daysOfWeek.${day}`)}
            value={days[day]}
            timeFormat={timeFormat}
            closedLabel={t('closedLabel')}
            opensAtLabel={t('opensAt')}
            closesAtLabel={t('closesAt')}
            hourLabel={t('hourLabel')}
            minuteLabel={t('minuteLabel')}
            periodLabel={t('periodLabel')}
            copyToWeekdaysLabel={day === 'monday' ? t('copyToWeekdays') : undefined}
            onChange={onDayChange}
            onCopyToWeekdays={day === 'monday' ? onCopyMondayToWeekdays : undefined}
          />
        ))}
      </div>
    </SectionCard>
  );
}
