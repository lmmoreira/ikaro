'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { WeekDayRow } from '@/shared/components/ui/week-day-row';
import { WEEK_DAYS, type DayHoursValue, type WeekDay } from '@/features/platform/settings-form';
import { FieldError, INPUT_CLASS } from './SettingsFormFields';

interface SettingsHoursSectionProps {
  readonly timezone: string;
  readonly timezoneError: string | undefined;
  readonly timezones: readonly string[];
  readonly days: Record<WeekDay, DayHoursValue>;
  readonly timeFormat: '24h' | '12h';
  readonly onTimezoneChange: (value: string) => void;
  readonly onDayChange: (day: WeekDay, patch: Partial<DayHoursValue>) => void;
  readonly onCopyMondayToWeekdays: () => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Business hours" section (timezone + the 7-day
// hours grid) is a self-contained, cohesive group, unrelated to the other SectionCard groups
// around it.
export function SettingsHoursSection({
  timezone,
  timezoneError,
  timezones,
  days,
  timeFormat,
  onTimezoneChange,
  onDayChange,
  onCopyMondayToWeekdays,
}: SettingsHoursSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.hours')}>
      <div>
        <label
          htmlFor="settings-timezone"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('timezoneLabel')}
        </label>
        <select
          id="settings-timezone"
          data-testid="settings-timezone-select"
          value={timezone}
          onChange={(event) => onTimezoneChange(event.target.value)}
          aria-invalid={Boolean(timezoneError)}
          className={`${INPUT_CLASS} max-w-md`}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz === 'America/Sao_Paulo' ? t('timezoneBrasilia') : tz}
            </option>
          ))}
        </select>
        <FieldError id="settings-timezone-error" message={timezoneError} />
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
