'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

interface TimePickerProps {
  // 24h "HH:MM" — the wire/storage format regardless of display format (matches the
  // backend TimeOfDay VO). Never store 12h state; always convert at the display boundary.
  readonly value: string;
  readonly onChange: (value: string) => void;
  // Display convention — pass useFormatting().timeFormat from the consumer. Never hardcode
  // '12h'/'24h' here: this component must render correctly for any tenant's locale.
  readonly timeFormat: '24h' | '12h';
  readonly disabled?: boolean;
  readonly hourAriaLabel: string;
  readonly minuteAriaLabel: string;
  readonly periodAriaLabel: string;
}

type Period = 'AM' | 'PM';

const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
const HOURS_24 = Array.from({ length: 24 }, (_, hour) => hour);
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);

function parseTime(value: string): { hour24: number; minute: number } {
  const [hourPart, minutePart] = value.split(':');
  return { hour24: Number(hourPart) || 0, minute: Number(minutePart) || 0 };
}

function to24Hour(hour12: number, period: Period): number {
  const base = hour12 % 12;
  return period === 'PM' ? base + 12 : base;
}

function to12Hour(hour24: number): { hour12: number; period: Period } {
  const period: Period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

function formatTimeValue(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Shared hour+minute (+ AM/PM for 12h locales) picker built on the shadcn Select primitive —
// replaces plain <input type="time"> across the dashboard. No seconds: business hours (and
// every other current consumer) only need HH:MM. See docs/CODE_STANDARDS.md
// "Localization-driven fields" — timeFormat must come from the tenant's own settings.
export function TimePicker({
  value,
  onChange,
  timeFormat,
  disabled = false,
  hourAriaLabel,
  minuteAriaLabel,
  periodAriaLabel,
}: TimePickerProps): React.JSX.Element {
  const { hour24, minute } = parseTime(value);
  const is12h = timeFormat === '12h';
  const { hour12, period } = to12Hour(hour24);

  function commitHour(rawHour: string): void {
    const picked = Number(rawHour);
    const nextHour24 = is12h ? to24Hour(picked, period) : picked;
    onChange(formatTimeValue(nextHour24, minute));
  }

  function commitMinute(rawMinute: string): void {
    onChange(formatTimeValue(hour24, Number(rawMinute)));
  }

  function commitPeriod(rawPeriod: string): void {
    onChange(formatTimeValue(to24Hour(hour12, rawPeriod as Period), minute));
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        disabled={disabled}
        value={String(is12h ? hour12 : hour24)}
        onValueChange={commitHour}
      >
        <SelectTrigger aria-label={hourAriaLabel} className="w-[4.25rem] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(is12h ? HOURS_12 : HOURS_24).map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {is12h ? hour : String(hour).padStart(2, '0')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span aria-hidden="true" className="text-sm text-gray-400">
        :
      </span>

      <Select
        disabled={disabled}
        value={String(minute).padStart(2, '0')}
        onValueChange={commitMinute}
      >
        <SelectTrigger aria-label={minuteAriaLabel} className="w-[4.25rem] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((minuteOption) => (
            <SelectItem key={minuteOption} value={minuteOption}>
              {minuteOption}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {is12h && (
        <Select disabled={disabled} value={period} onValueChange={commitPeriod}>
          <SelectTrigger aria-label={periodAriaLabel} className="w-[4.25rem] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
