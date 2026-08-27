'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
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

// Parsed as LOCAL time (not UTC) deliberately — fed back into <Calendar selected=. react-day-
// picker's own range-extension logic (addToRange) compares it against the LOCAL-midnight Date
// objects it constructs internally for each day cell; parsing this one as UTC instead corrupts
// that comparison the moment the runtime's local offset is non-zero (confirmed via a real CI
// failure — a second click meant to extend an existing range instead shifted `from` by a day).
// Only for feeding the Calendar's `selected` prop — use toDisplayDate for the label below, which
// has the opposite requirement.
function toLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

// Parsed as UTC deliberately — formatDateLong pins `timeZone: 'UTC'` internally, so this must be
// fed a UTC-midnight Date to round-trip correctly regardless of the runtime's local offset (a
// local-midnight Date, like toLocalDate above, displays the wrong day here for a runtime with a
// positive UTC offset — confirmed empirically under TZ=Asia/Tokyo). Only for the label; using
// this for the Calendar's `selected` prop instead would reintroduce the addToRange bug above.
function toDisplayDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

// react-day-picker constructs each day cell's Date at LOCAL midnight in the JS runtime's own
// timezone — reading it back out via the SAME local getters (not re-interpreting it through a
// different timezone, e.g. the tenant's business timezone) is what keeps "the calendar day the
// user visually clicked" stable regardless of what timezone the runtime happens to be in.
// Converting through a different timezone here previously shifted the selected day by one
// whenever the runtime's local timezone differed from the tenant's (confirmed via a real CI
// failure, GitHub's UTC runners vs. America/Sao_Paulo: midnight UTC on the 10th become the 9th
// once reinterpreted as Sao Paulo time) — this is a real correctness bug, not just a test issue.
function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Extracted from the component body (SonarCloud S3358 — nested ternary, PR #436 round 7 finding).
function resolveDateRangeLabel(
  value: LeadFormDateRangeValue,
  placeholder: string,
  formatDateLong: (date: Date) => string,
): string {
  if (!value.from) return placeholder;
  const from = formatDateLong(toDisplayDate(value.from));
  if (!value.to) return from;
  return `${from} – ${formatDateLong(toDisplayDate(value.to))}`;
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
    ? { from: toLocalDate(value.from), to: value.to ? toLocalDate(value.to) : undefined }
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
        />
      </PopoverContent>
    </Popover>
  );
}
