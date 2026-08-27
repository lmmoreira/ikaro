'use client';

import type * as React from 'react';
import { useContext } from 'react';
import { DayPicker } from 'react-day-picker';
import { buttonVariants } from '@/shared/components/ui/button';
import { FormattingContext } from '@/shared/lib/formatting/formatting-context';
import { resolveDayPickerLocale } from '@/shared/lib/i18n/day-picker-locale';
import { cn } from '@/shared/utils/cn';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function getModifiersClassName(): Record<string, string> {
  return {
    root: 'p-3',
    months: 'flex w-full flex-col gap-4 sm:flex-row sm:gap-8',
    month: 'relative space-y-4',
    month_caption: 'relative flex h-11 w-full items-center justify-center px-11 pt-1',
    caption_label: 'text-sm font-semibold text-gray-900',
    button_previous: cn(
      buttonVariants({ variant: 'outline' }),
      'absolute left-0 top-0 z-10 h-11 w-11 bg-transparent p-0 opacity-70 hover:opacity-100',
    ),
    button_next: cn(
      buttonVariants({ variant: 'outline' }),
      'absolute right-0 top-0 z-10 h-11 w-11 bg-transparent p-0 opacity-70 hover:opacity-100',
    ),
    chevron: 'h-4 w-4',
    // `weekdays` (the header <tr> containing every `weekday` <th>) needs the same explicit flex
    // override as `week` below it — without it, the header row stays a native table row while
    // the date rows are flexed, so the browser's table column-sizing algorithm has nothing but
    // the header row left to size columns from and distorts it (each `weekday` cell's own `w-9`
    // is then ignored) — found live via a real rendered screenshot, M20-S13 story feedback,
    // 2026-08-27: Sunday's header cell rendered far wider than the rest, throwing off the whole
    // row's alignment against the day grid beneath it.
    weekdays: 'flex w-full',
    weekday: 'text-gray-500 rounded-md w-9 font-normal text-[0.8rem]',
    month_grid: 'w-full border-collapse space-y-1',
    // react-day-picker v10 renamed these from v8/v9's `row`/`cell` to `week`/`day` — the old
    // keys aren't recognized `classNames` keys anymore, so this styling was silently dead code
    // (found while chasing an identical layout bug in AvailabilityCalendar.tsx, M18-S01).
    week: 'flex w-full mt-2',
    day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
    // react-day-picker's `classNames` map is applied per-key to a fixed element: `selected`
    // lands on the `<td>` (Day) wrapper, never on the `<button>` (DayButton) — DayButton's own
    // className is always this same static string, with no modifier awareness at all (confirmed
    // in the library's own DayButton.js/DayPicker.js source, not assumed). The ghost variant's
    // own `text-primary` therefore always wins for the button's actual visible number, no matter
    // what `!text-white`/`!important` the ancestor `<td>` carries — CSS specificity on the
    // button's own declaration beats an ancestor's inherited value regardless of `!important`
    // there. The `[[data-selected=true]_&]:` arbitrary variant targets the button itself via the
    // ancestor's `data-selected` attribute (set on the `<td>` for every day in a selection,
    // including every day of a `range_middle`, not just the two endpoints — verified in
    // DayPicker.js's own `modifiers[SelectionState.selected] = isSelected?.(date) || ...`).
    // Found live via a real rendered range-mode screenshot, M20-S13 story feedback, 2026-08-27:
    // every day in the middle of a selected date range showed blue-on-blue, invisible numbers —
    // `calendar.spec.tsx`'s own existing test only asserted the `<td>` carries the `!text-white`
    // class string, never that the visible button text actually renders white.
    day_button: cn(
      buttonVariants({ variant: 'ghost' }),
      'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
      '[[data-selected=true]_&]:!bg-blue-600 [[data-selected=true]_&]:!text-white [[data-selected=true]_&]:hover:!bg-blue-600 [[data-selected=true]_&]:hover:!text-white',
    ),
    today: 'ring-1 ring-inset ring-blue-400',
    selected: 'bg-blue-600 !text-white hover:bg-blue-600 hover:!text-white',
    outside: 'text-gray-400 opacity-50',
    disabled: 'text-gray-300 opacity-50',
    hidden: 'invisible',
  };
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale: localeProp,
  ...props
}: CalendarProps): React.JSX.Element {
  const { locale } = useContext(FormattingContext);

  return (
    <DayPicker
      locale={localeProp ?? resolveDayPickerLocale(locale)}
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn('p-3', className)}
      classNames={{
        ...getModifiersClassName(),
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
