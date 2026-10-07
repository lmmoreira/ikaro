'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  localDateFromISO,
  toLocalISODate,
  utcDateFromISO,
} from '@/shared/lib/formatting/calendar-day';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

export interface LeadFormDateRangeValue {
  readonly from?: string;
  readonly to?: string;
}

interface LeadFormDateRangeControlProps {
  readonly value: LeadFormDateRangeValue;
  readonly onChange: (value: LeadFormDateRangeValue) => void;
  readonly placeholder: string;
}

// Extracted from the component body (SonarCloud S3358 — nested ternary, PR #436 round 7 finding).
function resolveDateRangeLabel(
  value: LeadFormDateRangeValue,
  placeholder: string,
  formatDateLong: (date: Date) => string,
): string {
  if (!value.from) return placeholder;
  const from = formatDateLong(utcDateFromISO(value.from));
  if (!value.to) return from;
  return `${from} – ${formatDateLong(utcDateFromISO(value.to))}`;
}

// Picking a range via react-day-picker's own range mode already keeps `from` <= `to` — clicking
// a day before the current `from` restarts the range with that day as the new `from`, so no
// extra clamp/validation is needed here (docs/M20-LEAD-FORM-MODULE.md M20-S13 story-discovery).
export function LeadFormDateRangeControl({
  value,
  onChange,
  placeholder,
}: LeadFormDateRangeControlProps): React.JSX.Element {
  const { formatDateLong } = useFormatting();
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange | undefined = value.from
    ? { from: localDateFromISO(value.from), to: value.to ? localDateFromISO(value.to) : undefined }
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
      from: toLocalISODate(range.from),
      to: range.to ? toLocalISODate(range.to) : undefined,
    });
  }

  const label = resolveDateRangeLabel(value, placeholder, formatDateLong);

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
          // Both months are already fully visible side by side, so the leading/trailing "outside"
          // context days react-day-picker shows for a single-month view are redundant here — and
          // near a month boundary, an outside day's date can collide with the *same* date rendered
          // as a real day in the adjacent grid, giving two elements the identical data-day/aria-label
          // (e.g. Aug 30 shown as a real day in the August grid and as a leading outside day in
          // September's grid) — a real bug independent of any test, not just a locator-strictness
          // issue (found via a genuine CI failure on PR #438, 2026-08-28, unrelated to that PR's
          // own change — e2e/leads-search.spec.ts's `[data-day="..."] button` locator matched twice).
          showOutsideDays={false}
        />
      </PopoverContent>
    </Popover>
  );
}
