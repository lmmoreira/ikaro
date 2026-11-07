'use client';

import { useLocale, useTranslations } from 'next-intl';
import { DayPicker } from 'react-day-picker';
import type { ResourceSelectionItem } from '@ikaro/types';
import { useAvailabilityCalendarState } from '@/features/booking/hooks/useAvailabilityCalendarState';
import { resolveDayPickerLocale } from '@/shared/lib/i18n/day-picker-locale';
import { cn } from '@/shared/utils/cn';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { DAY_PICKER_COMPONENTS } from './AvailabilityCalendarDayPicker';

interface AvailabilityCalendarProps {
  readonly slug: string;
  readonly serviceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly maxBookingAdvanceDays: number;
  readonly minBookingAdvanceHours?: number;
  readonly timezone: string;
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
}

export function AvailabilityCalendar({
  slug,
  serviceIds,
  selectedDate,
  onSelectDate,
  maxBookingAdvanceDays,
  minBookingAdvanceHours = 0,
  timezone,
  resourceSelections,
  durationMinutes,
}: AvailabilityCalendarProps): React.JSX.Element {
  const t = useTranslations('booking');
  const locale = useLocale();
  const {
    month,
    startMonth,
    endMonth,
    selected,
    days,
    error,
    isDisabled,
    isOutOfRange,
    showOutOfRangeMessage,
    handleSelect,
    handleMonthChange,
    handleRetry,
  } = useAvailabilityCalendarState({
    slug,
    serviceIds,
    selectedDate,
    onSelectDate,
    maxBookingAdvanceDays,
    minBookingAdvanceHours,
    timezone,
    resourceSelections,
    durationMinutes,
  });

  if (error) {
    return (
      <BrandedFeedbackMessage
        title={t('availability.loadError')}
        onRetry={handleRetry}
        retryLabel={t('errors.tryAgain')}
      />
    );
  }

  if (!days) {
    return <p>{t('availability.loading')}</p>;
  }

  return (
    <div>
      <DayPicker
        mode="single"
        locale={resolveDayPickerLocale(locale)}
        month={month}
        onMonthChange={handleMonthChange}
        startMonth={startMonth}
        endMonth={endMonth}
        showOutsideDays={false}
        selected={selected}
        onSelect={handleSelect}
        disabled={isDisabled}
        modifiers={{ outOfRange: isOutOfRange }}
        labels={{
          labelPrevious: () => t('availability.previousMonth'),
          labelNext: () => t('availability.nextMonth'),
        }}
        components={DAY_PICKER_COMPONENTS}
        className="w-full p-0"
        classNames={{
          months: 'relative w-full',
          month: 'w-full space-y-2',
          // nav is absolutely positioned across the top of `months`, overlapping the caption
          // row — month_caption's horizontal padding (px-9, matching the 36px button size)
          // reserves the room the two buttons sit in. Mirrors shadcn's calendar registry
          // component's own nav/caption layout (ui.shadcn.com/docs/components/calendar).
          nav: 'absolute inset-x-0 top-0 flex w-full items-center justify-between',
          button_previous: cn(
            'flex h-9 w-9 items-center justify-center rounded-[var(--ba-radius)]',
            'text-[var(--ba-primary,#2563eb)] hover:opacity-70',
            'aria-disabled:opacity-30 aria-disabled:cursor-not-allowed',
          ),
          button_next: cn(
            'flex h-9 w-9 items-center justify-center rounded-[var(--ba-radius)]',
            'text-[var(--ba-primary,#2563eb)] hover:opacity-70',
            'aria-disabled:opacity-30 aria-disabled:cursor-not-allowed',
          ),
          // No `position` here (deliberately) — nav (rendered earlier in the DOM) is the only
          // positioned element in this row. Giving month_caption `relative` too made it a
          // later-DOM-order positioned sibling, which paints on top per CSS stacking rules and
          // silently swallows clicks meant for the nav buttons underneath (confirmed by testing
          // in the browser: "next month" became unclickable).
          // border-b on both rows below gives three visually distinct sections — month header,
          // weekday labels, day grid — instead of one undifferentiated block.
          month_caption:
            'flex h-9 w-full items-center justify-center border-b border-gray-100 px-9 text-sm font-semibold',
          month_grid: 'w-full border-collapse',
          weekdays: 'flex w-full border-b border-gray-100 pb-2',
          weekday: 'flex-1 text-center text-xs font-normal opacity-60',
          weeks: 'flex flex-col gap-1 pt-2',
          week: 'flex w-full',
          day: 'flex flex-1 items-center justify-center p-0',
        }}
      />

      {showOutOfRangeMessage && (
        <div className="mt-3" data-testid="calendar-out-of-range-message">
          <BrandedFeedbackMessage
            title={t('availability.outOfRangeMessage', { days: maxBookingAdvanceDays })}
          />
        </div>
      )}
    </div>
  );
}
