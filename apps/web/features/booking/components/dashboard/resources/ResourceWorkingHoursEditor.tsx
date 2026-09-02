'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceWorkingHours } from '@ikaro/types';
import {
  WeekDayRow,
  type DayHoursValue as DayValue,
  type WeekDay,
} from '@/shared/components/ui/week-day-row';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

const WEEK_DAYS: readonly WeekDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DEFAULT_CLOSED_DAY: DayValue = { open: '09:00', close: '18:00', closed: true };

function toDayValue(hours: { open: string; close: string } | null | undefined): DayValue {
  return hours ? { open: hours.open, close: hours.close, closed: false } : DEFAULT_CLOSED_DAY;
}

// Built as an explicit object literal (not Object.fromEntries + a cast) so TypeScript checks
// the result against ResourceWorkingHours's exact named-property shape directly — no `as`.
function toDayValues(workingHours: ResourceWorkingHours | null): Record<WeekDay, DayValue> {
  return {
    monday: toDayValue(workingHours?.monday),
    tuesday: toDayValue(workingHours?.tuesday),
    wednesday: toDayValue(workingHours?.wednesday),
    thursday: toDayValue(workingHours?.thursday),
    friday: toDayValue(workingHours?.friday),
    saturday: toDayValue(workingHours?.saturday),
    sunday: toDayValue(workingHours?.sunday),
  };
}

function toWorkingHoursEntry(value: DayValue): { open: string; close: string } | null {
  return value.closed ? null : { open: value.open, close: value.close };
}

function toWorkingHours(days: Record<WeekDay, DayValue>): ResourceWorkingHours {
  return {
    monday: toWorkingHoursEntry(days.monday),
    tuesday: toWorkingHoursEntry(days.tuesday),
    wednesday: toWorkingHoursEntry(days.wednesday),
    thursday: toWorkingHoursEntry(days.thursday),
    friday: toWorkingHoursEntry(days.friday),
    saturday: toWorkingHoursEntry(days.saturday),
    sunday: toWorkingHoursEntry(days.sunday),
  };
}

interface ResourceWorkingHoursEditorProps {
  readonly value: ResourceWorkingHours | null;
  readonly onChange: (value: ResourceWorkingHours | null) => void;
}

// Per-weekday working-hours editor for a Resource — same shape as the tenant's own
// businessHours editor (SettingsHoursSection.tsx) minus the timezone field (a Resource
// always inherits the tenant's timezone). No discovery-stage prototype for this screen
// (dev-notes.md's own flagged gap) — built from SettingsHoursSection's existing pattern,
// reusing the shared DayRow/TimePicker primitives rather than from scratch.
export function ResourceWorkingHoursEditor({
  value,
  onChange,
}: ResourceWorkingHoursEditorProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const settingsT = useTranslations('dashboard.settingsPage');
  const { timeFormat } = useFormatting();
  const days = toDayValues(value);
  const usesDefault = value === null;

  // onChange is the raw useState setter from both callers (ResourceCreateForm,
  // ResourceEditFormFields) — React guarantees it's referentially stable, so closing over it
  // (instead of `days`, which is a fresh object every render) keeps setDay's own identity
  // stable too, letting memo(WeekDayRow) actually skip re-rendering unrelated day rows on
  // keystroke, per the shared component's own documented contract (Codex review, PR #459
  // round 3). valueRef always holds the latest value so the patch merges correctly.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setDay = useCallback(
    (day: WeekDay, patch: Partial<DayValue>): void => {
      const currentDays = toDayValues(valueRef.current);
      const next = { ...currentDays, [day]: { ...currentDays[day], ...patch } };
      onChange(toWorkingHours(next));
    },
    [onChange],
  );

  function copyMondayToWeekdays(): void {
    const monday = days.monday;
    const next = { ...days };
    for (const day of ['tuesday', 'wednesday', 'thursday', 'friday'] as const) {
      next[day] = { ...monday };
    }
    onChange(toWorkingHours(next));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-gray-900">{t('useDefaultHours')}</p>
          <p className="text-xs text-gray-500">{t('useDefaultHoursSub')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={usesDefault}
          data-testid="resource-hours-inherit-toggle"
          onClick={() => onChange(usesDefault ? toWorkingHours(days) : null)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${usesDefault ? 'bg-blue-600' : 'bg-gray-300'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${usesDefault ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {!usesDefault && (
        <div data-testid="resource-hours-custom" className="rounded-2xl border border-border p-3">
          <p className="mb-1 text-sm font-semibold text-gray-900">{t('customHoursLabel')}</p>
          {WEEK_DAYS.map((day) => (
            <WeekDayRow
              key={day}
              day={day}
              label={settingsT(`daysOfWeek.${day}`)}
              value={days[day]}
              timeFormat={timeFormat}
              closedLabel={settingsT('closedLabel')}
              opensAtLabel={settingsT('opensAt')}
              closesAtLabel={settingsT('closesAt')}
              hourLabel={settingsT('hourLabel')}
              minuteLabel={settingsT('minuteLabel')}
              periodLabel={settingsT('periodLabel')}
              copyToWeekdaysLabel={day === 'monday' ? settingsT('copyToWeekdays') : undefined}
              onChange={setDay}
              onCopyToWeekdays={day === 'monday' ? copyMondayToWeekdays : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
