'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { TimePicker } from '@/shared/components/ui/time-picker';
import {
  ALERT_DEFAULT_EXPIRY_DAYS,
  ALERT_EXPIRY_DAYS_OPTIONS,
} from '@/features/booking/model/availability-alert-form';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import {
  localDateFromISO,
  toLocalISODate,
  utcDateFromISO,
} from '@/shared/lib/formatting/calendar-day';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { FieldError } from './AvailabilityAlertFields';

// The alert form's date, time and duration controls. They are the project's shared shadcn/ui
// primitives, used the way the rest of the app uses them: a day is a Popover + Calendar
// (LeadFormDateRangeControl, ScheduleDateTimeRangeSheet), an hour is the shared TimePicker
// (settings business hours), a choice list is the shadcn Select — never a native date/time input
// or <select> (docs: "prefer shadcn/ui primitives", CLAUDE.md § Web styling boundary).

interface DatePopoverProps {
  readonly rowKey: string;
  readonly labelId: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (isoDate: string) => void;
}

function DatePopover({
  rowKey,
  labelId,
  value,
  disabled,
  onChange,
}: DatePopoverProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { timezone, formatDateLong } = useFormatting();
  const today = toISODateInTimezone(new Date(), timezone);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => localDateFromISO(value || today));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-labelledby={labelId}
          data-testid="alert-date"
          data-row-key={rowKey}
          className="min-w-[11rem] justify-start gap-2 px-3 font-normal"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {value ? formatDateLong(utcDateFromISO(value)) : t('availabilityAlert.date.placeholder')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          numberOfMonths={2}
          // Both months are visible, so the leading/trailing "outside" days are redundant — and
          // near a month boundary they duplicate a real day's data-day/aria-label (see
          // LeadFormDateRangeControl for the CI failure that found it).
          showOutsideDays={false}
          month={month}
          onMonthChange={setMonth}
          selected={value ? localDateFromISO(value) : undefined}
          disabled={{ before: localDateFromISO(today) }}
          onSelect={(picked) => {
            if (!picked) return;
            onChange(toLocalISODate(picked));
            setMonth(picked);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface TimeControlProps {
  readonly rowKey: string;
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (time: string) => void;
}

function TimeControl({
  rowKey,
  label,
  value,
  disabled,
  onChange,
}: TimeControlProps): React.JSX.Element {
  const t = useTranslations('booking');
  const { timeFormat } = useFormatting();

  return (
    <TimePicker
      value={value}
      onChange={onChange}
      timeFormat={timeFormat}
      disabled={disabled}
      hourAriaLabel={t('availabilityAlert.time.hour', { label })}
      minuteAriaLabel={t('availabilityAlert.time.minute', { label })}
      periodAriaLabel={t('availabilityAlert.time.period', { label })}
      hourTestId="alert-time-hour"
      minuteTestId="alert-time-minute"
      periodTestId="alert-time-period"
      dataRowKey={rowKey}
    />
  );
}

interface DateTimeFieldProps {
  readonly rowKey: 'rangeFrom' | 'rangeTo';
  readonly labelKey: 'range.from' | 'range.to';
  readonly date: string;
  readonly time: string;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onDateChange: (isoDate: string) => void;
  readonly onTimeChange: (time: string) => void;
}

// One end of the one-time range: a day (Popover + Calendar) and an hour (TimePicker).
export function DateTimeField({
  rowKey,
  labelKey,
  date,
  time,
  disabled,
  error,
  onDateChange,
  onTimeChange,
}: DateTimeFieldProps): React.JSX.Element {
  const t = useTranslations('booking');
  const labelId = `alert-${rowKey}-label`;
  const label = t(`availabilityAlert.${labelKey}`);

  return (
    <div>
      <p id={labelId} className="mb-1 block text-sm font-medium">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <DatePopover
          rowKey={rowKey}
          labelId={labelId}
          value={date}
          disabled={disabled}
          onChange={onDateChange}
        />
        <TimeControl
          rowKey={rowKey}
          label={label}
          value={time}
          disabled={disabled}
          onChange={onTimeChange}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

interface TimeFieldProps {
  readonly rowKey: 'weeklyFrom' | 'weeklyTo';
  readonly labelKey: 'weekly.from' | 'weekly.to';
  readonly value: string;
  readonly disabled: boolean;
  readonly error: string | null;
  readonly onChange: (time: string) => void;
}

// One end of the weekly window: just an hour (TimePicker).
export function TimeField({
  rowKey,
  labelKey,
  value,
  disabled,
  error,
  onChange,
}: TimeFieldProps): React.JSX.Element {
  const t = useTranslations('booking');
  const label = t(`availabilityAlert.${labelKey}`);

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">{label}</p>
      <TimeControl
        rowKey={rowKey}
        label={label}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
      <FieldError message={error} />
    </div>
  );
}

interface ExpirySelectProps {
  readonly value: number;
  readonly disabled: boolean;
  readonly onChange: (days: number) => void;
}

function expiryOptionLabel(t: ReturnType<typeof useTranslations>, days: number): string {
  if (days === ALERT_DEFAULT_EXPIRY_DAYS) {
    return t('availabilityAlert.expiry.daysDefault', { days });
  }
  if (days === ALERT_EXPIRY_DAYS_OPTIONS.at(-1)) {
    return t('availabilityAlert.expiry.daysMax', { days });
  }
  return t('availabilityAlert.expiry.days', { days });
}

export function ExpirySelect({ value, disabled, onChange }: ExpirySelectProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <div>
      <label htmlFor="alert-expiry" className="mb-1 block text-sm font-medium">
        {t('availabilityAlert.expiry.label')}
      </label>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(days) => onChange(Number(days))}
      >
        <SelectTrigger id="alert-expiry" data-testid="alert-expiry">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ALERT_EXPIRY_DAYS_OPTIONS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {expiryOptionLabel(t, days)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs opacity-60">{t('availabilityAlert.expiry.hint')}</p>
    </div>
  );
}
