'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';

export interface LeadFormDateRangeValue {
  readonly from?: string;
  readonly to?: string;
}

interface LeadFormDateRangeControlProps {
  readonly value: LeadFormDateRangeValue;
  readonly onChange: (value: LeadFormDateRangeValue) => void;
  readonly placeholder: string;
}

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

// Picking a range via react-day-picker's own range mode already keeps `from` <= `to` — clicking
// a day before the current `from` restarts the range with that day as the new `from`, so no
// extra clamp/validation is needed here (docs/M20-LEAD-FORM-MODULE.md M20-S13 story-discovery).
export function LeadFormDateRangeControl({
  value,
  onChange,
  placeholder,
}: LeadFormDateRangeControlProps): React.JSX.Element {
  const { timezone, formatDateLong } = useFormatting();
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange | undefined = value.from
    ? { from: toDate(value.from), to: value.to ? toDate(value.to) : undefined }
    : undefined;

  function handleSelect(range: DateRange | undefined): void {
    if (!range?.from) {
      onChange({});
      return;
    }
    // react-day-picker's range mode already resolves a single click into a valid 1-day range
    // ({from: day, to: day}) — closing the popover on that first click would never let a second
    // click extend it, so this relies on the Popover's own click-outside/Escape dismissal
    // instead of auto-closing here.
    onChange({
      from: toISODateInTimezone(range.from, timezone),
      to: range.to ? toISODateInTimezone(range.to, timezone) : undefined,
    });
  }

  const label = value.from
    ? value.to
      ? `${formatDateLong(toDate(value.from))} – ${formatDateLong(toDate(value.to))}`
      : formatDateLong(toDate(value.from))
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          data-testid="leads-date-range-trigger"
          className="justify-start gap-2 px-3 font-normal"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selectedRange}
          onSelect={handleSelect}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
