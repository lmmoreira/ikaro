'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { localDateFromISO, toLocalISODate } from '@/shared/lib/formatting/calendar-day';
import { useRecurrenceText } from './use-recurrence-text';

interface NewRecurringScheduleDateFieldProps {
  /** Static, so E2E can find the field; the error carries `${testId}-error` via `errorTestId`. */
  readonly testId: string;
  readonly errorTestId: string;
  readonly label: string;
  readonly value: string; // YYYY-MM-DD, '' until chosen
  /** The earliest and (optionally) the latest selectable day. */
  readonly min: string;
  readonly max: string | null;
  readonly error: string | null;
  readonly onChange: (isoDate: string) => void;
}

/** A calendar day, picked in a popover (the project's Popover + Calendar pair, never a native input). */
export function NewRecurringScheduleDateField({
  testId,
  errorTestId,
  label,
  value,
  min,
  max,
  error,
  onChange,
}: NewRecurringScheduleDateFieldProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules.new');
  const { formatDateKey } = useRecurrenceText();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => localDateFromISO(value || min));
  const labelId = `${testId}-label`;
  const errorId = `${testId}-error-message`;

  return (
    <div>
      <p id={labelId} className="mb-1 block text-sm font-semibold text-gray-900">
        {label}
      </p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-labelledby={labelId}
            aria-invalid={error !== null || undefined}
            aria-describedby={error === null ? undefined : errorId}
            data-testid={testId}
            className={`min-w-[11rem] justify-start gap-2 px-3 font-normal ${
              error === null ? '' : 'border-red-400'
            }`}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
            {value === '' ? t('datePlaceholder') : formatDateKey(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            showOutsideDays={false}
            month={month}
            onMonthChange={setMonth}
            selected={value === '' ? undefined : localDateFromISO(value)}
            disabled={[
              { before: localDateFromISO(min) },
              ...(max === null ? [] : [{ after: localDateFromISO(max) }]),
            ]}
            onSelect={(picked) => {
              if (!picked) return;
              onChange(toLocalISODate(picked));
              setMonth(picked);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {error !== null && (
        <p
          id={errorId}
          role="alert"
          data-testid={errorTestId}
          className="mt-1 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
