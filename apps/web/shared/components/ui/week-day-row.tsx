import { memo } from 'react';
import { TimePicker } from './time-picker';

// Generic day-of-week key — any 7-day open/close editor (tenant business hours, a Resource's
// own working hours, ...) uses this same shape. Not domain-specific to any one feature slice.
export type WeekDay =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface DayHoursValue {
  readonly open: string;
  readonly close: string;
  readonly closed: boolean;
}

interface WeekDayRowProps {
  readonly day: WeekDay;
  readonly label: string;
  readonly value: DayHoursValue;
  readonly timeFormat: '24h' | '12h';
  readonly closedLabel: string;
  readonly opensAtLabel: string;
  readonly closesAtLabel: string;
  readonly hourLabel: string;
  readonly minuteLabel: string;
  readonly periodLabel: string;
  readonly copyToWeekdaysLabel?: string;
  readonly onChange: (day: WeekDay, patch: Partial<DayHoursValue>) => void;
  readonly onCopyToWeekdays?: () => void;
}

// Shared per-weekday open/close row — extracted from the tenant Settings hours editor
// (originally SettingsFormAdvancedFields.tsx's DayRow, M13/TD37-S5A) once a second feature
// (M21-S04's Resource working-hours editor) needed the identical shape. Per CLAUDE.md §11's
// domain-slice rule, a component used by more than one domain slice belongs in shared/, not
// re-imported cross-slice from whichever domain happened to build it first.
//
// Memoized + fed a stable `onChange` (setDay) so typing in an unrelated field doesn't
// re-render all 7 day rows (14 TimePickers / 28 Radix Selects) on every keystroke.
export const WeekDayRow = memo(function WeekDayRow({
  day,
  label,
  value,
  timeFormat,
  closedLabel,
  opensAtLabel,
  closesAtLabel,
  hourLabel,
  minuteLabel,
  periodLabel,
  copyToWeekdaysLabel,
  onChange,
  onCopyToWeekdays,
}: WeekDayRowProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <span className="w-24 shrink-0 text-sm font-semibold text-gray-900">{label}</span>

      <TimePicker
        value={value.open}
        onChange={(open) => onChange(day, { open })}
        timeFormat={timeFormat}
        disabled={value.closed}
        hourAriaLabel={`${opensAtLabel} — ${hourLabel} — ${label}`}
        minuteAriaLabel={`${opensAtLabel} — ${minuteLabel} — ${label}`}
        periodAriaLabel={`${opensAtLabel} — ${periodLabel} — ${label}`}
        hourTestId="week-day-row-open-hour"
        minuteTestId="week-day-row-open-minute"
        periodTestId="week-day-row-open-period"
        dataRowKey={day}
      />
      <span aria-hidden="true" className="text-sm text-gray-400">
        –
      </span>
      <TimePicker
        value={value.close}
        onChange={(close) => onChange(day, { close })}
        timeFormat={timeFormat}
        disabled={value.closed}
        hourAriaLabel={`${closesAtLabel} — ${hourLabel} — ${label}`}
        minuteAriaLabel={`${closesAtLabel} — ${minuteLabel} — ${label}`}
        periodAriaLabel={`${closesAtLabel} — ${periodLabel} — ${label}`}
        hourTestId="week-day-row-close-hour"
        minuteTestId="week-day-row-close-minute"
        periodTestId="week-day-row-close-period"
        dataRowKey={day}
      />

      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          aria-label={`${closedLabel} — ${label}`}
          checked={value.closed}
          onChange={(event) => onChange(day, { closed: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        {closedLabel}
      </label>

      {onCopyToWeekdays && copyToWeekdaysLabel && (
        <button
          type="button"
          data-testid="day-copy-monday"
          onClick={onCopyToWeekdays}
          className="ml-auto text-sm font-semibold text-blue-600 hover:underline"
        >
          {copyToWeekdaysLabel}
        </button>
      )}
    </div>
  );
});
